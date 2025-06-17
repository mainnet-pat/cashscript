import { binToHex, decodeTransaction, hexToBin, isHex } from '@bitauth/libauth';
import { sha256 } from '@cashscript/utils';
import { Utxo, Network } from '../interfaces.js';
import NetworkProvider from './NetworkProvider.js';
import { addressToLockScript, randomUtxo } from '../utils.js';
import { TemplateScenarioOptions } from '../advanced/LibauthTemplate.js';

// redeclare the addresses from vars.ts instead of importing them
const aliceAddress = 'bchtest:qpgjmwev3spwlwkgmyjrr2s2cvlkkzlewq62mzgjnp';
const bobAddress = 'bchtest:qz6q5gqnxdldkr07xpls5474mmzmlesd6qnux4skuc';
const carolAddress = 'bchtest:qqsr7nqwe6rq5crj63gy5gdqchpnwmguusmr7tfmsj';

export default class MockNetworkProvider implements NetworkProvider {
  // we use lockingBytecode as the key for utxoMap to make cashaddresses and tokenaddresses interchangeable
  private utxoMap: Record<string, Utxo[]> = {};
  private transactionMap: Record<string, string> = {};
  private currentBlockHeight: number = 133700;
  private currentBlockTime: number | undefined = undefined; // Example timestamp
  public network: Network = Network.MOCKNET;

  constructor() {
    for (let i = 0; i < 3; i += 1) {
      this.addUtxo(aliceAddress, randomUtxo());
      this.addUtxo(bobAddress, randomUtxo());
      this.addUtxo(carolAddress, randomUtxo());
    }
  }

  async getUtxos(address: string): Promise<Utxo[]> {
    const lockingBytecode = binToHex(addressToLockScript(address));
    return this.utxoMap[lockingBytecode] ?? [];
  }

  async setBlockHeight(height: number): Promise<void> {
    this.currentBlockHeight = height;
  }

  async getBlockHeight(): Promise<number> {
    return this.currentBlockHeight;
  }

  async setBlockTime(timestamp: number | undefined): Promise<void> {
    this.currentBlockTime = timestamp;
    TemplateScenarioOptions.currentBlockTime = timestamp;
  }

  async getBlockTime(): Promise<number | undefined> {
    return this.currentBlockTime;
  }

  async getRawTransaction(txid: string): Promise<string> {
    return this.transactionMap[txid];
  }

  async sendRawTransaction(txHex: string): Promise<string> {
    const transactionBin = hexToBin(txHex);

    const txid = binToHex(sha256(sha256(transactionBin)).reverse());
    this.transactionMap[txid] = txHex;

    const decoded = decodeTransaction(transactionBin);
    if (typeof decoded === 'string') {
      throw new Error(`${decoded}`);
    }

    // remove (spend) UTXOs from the map
    for (const input of decoded.inputs) {
      for (const address of Object.keys(this.utxoMap)) {
        const utxos = this.utxoMap[address];
        const index = utxos.findIndex(
          (utxo) => utxo.txid === binToHex(input.outpointTransactionHash) && utxo.vout === input.outpointIndex
        );

        if (index !== -1) {
          // Remove the UTXO from the map
          utxos.splice(index, 1);
          this.utxoMap[address] = utxos;
          break; // Exit loop after finding and removing the UTXO
        }
        if (utxos.length === 0) {
          delete this.utxoMap[address]; // Clean up empty address entries
        }
      }
    }

    // add new UTXOs to the map
    for (const [index, output] of decoded.outputs.entries()) {
      this.addUtxo(binToHex(output.lockingBytecode), {
        txid: txid,
        vout: index,
        satoshis: output.valueSatoshis,
        token: output.token && {
          ...output.token,
          category: binToHex(output.token.category),
          nft: output.token.nft && {
            ...output.token.nft,
            commitment: binToHex(output.token.nft.commitment),
          },
        },
      });
    }

    return txid;
  }

  addUtxo(addressOrLockingBytecode: string, utxo: Utxo): void {
    const lockingBytecode = isHex(addressOrLockingBytecode) ? addressOrLockingBytecode : binToHex(addressToLockScript(addressOrLockingBytecode));
    if (!this.utxoMap[lockingBytecode]) {
      this.utxoMap[lockingBytecode] = [];
    }

    this.utxoMap[lockingBytecode].push(utxo);
  }

  reset(): void {
    this.utxoMap = {};
    this.transactionMap = {};
  }
}
