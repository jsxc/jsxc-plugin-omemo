import Store from './Store'
import Device from './Device'
import { IJID } from 'jsxc/src/JID.interface'
import { KeyHelper, SignalProtocolAddress, SessionBuilder, SessionCipher } from '../vendor/Signal'
import ArrayBufferUtils from '../util/ArrayBuffer'
import { AES_EXTRACTABLE, AES_KEY_LENGTH, AES_TAG_LENGTH } from '../util/Const'

export default class Peer {
   private static ownJid: IJID;

   private static ownDevices: any = {};

   private devices: any = {};

   constructor(private jid: IJID, private store: Store) {
   }

   public async encrypt(plaintext: string) {
      let remoteDeviceIds = this.store.getDeviceList(this.jid.bare);
      let ownDeviceIds = this.store.getOwnDeviceList().filter((id) => {
         return id !== this.store.getDeviceId();
      });

      let aes = await this.encryptWithAES(plaintext);
      let promises = [];

      for (let id of remoteDeviceIds) {
         let device = this.getDevice(id);

         promises.push(device.encrypt(aes.keydata));
      }

      for (let id of ownDeviceIds) {
         let device = this.getOwnDevice(id);

         promises.push(device.encrypt(aes.keydata));
      }

      let keys = await Promise.all(promises);

      keys = keys.filter(key => key !== null);

      if (keys.length === 0) {
         throw 'Could not encrypt data with any Signal session';
      }

      return {
         keys: keys,
         iv: aes.iv,
         payload: aes.payload
      };
   }

   public decrypt(deviceId: number, ciphertext, preKey: boolean = false) {
      let device = this.getDevice(deviceId);

      return device.decrypt(ciphertext, preKey);
   }

   private getDevice(id: number): Device {
      if (!this.devices[id]) {
         this.devices[id] = new Device(this.jid, id, this.store);
      }

      return this.devices[id];
   }

   private getOwnDevice(id: number): Device {
      if (!Peer.ownDevices[id]) {
         Peer.ownDevices[id] = new Device(Peer.ownJid, id, this.store);
      }

      return Peer.ownDevices[id];
   }

   public static setOwnJid(jid: IJID) { //@REVIEW
      Peer.ownJid = jid;
   }

   private async encryptWithAES(plaintext) {
      let iv = window.crypto.getRandomValues(new Uint8Array(12));
      let key = await this.generateAESKey();
      let encrypted = await this.generateAESencryptedMessage(iv, key, plaintext);

      let ciphertext = encrypted.ciphertext;
      let authenticationTag = encrypted.authenticationTag;

      let keydata = await window.crypto.subtle.exportKey('raw', <CryptoKey>key)

      return {
         keydata: ArrayBufferUtils.concat(keydata, <ArrayBuffer>authenticationTag),
         iv: iv,
         payload: ciphertext
      }
   }

   private async generateAESKey(): Promise<CryptoKey> {
      let algo = {
         name: 'AES-GCM',
         length: AES_KEY_LENGTH,
      };
      let keyUsage = ['encrypt', 'decrypt'];

      let key = await window.crypto.subtle.generateKey(algo, AES_EXTRACTABLE, keyUsage);

      return key;
   }

   private async generateAESencryptedMessage(iv, key, plaintext): Promise<{ ciphertext: ArrayBuffer, authenticationTag: ArrayBuffer }> {
      let encryptOptions = {
         name: 'AES-GCM',
         iv: iv,
         tagLength: AES_TAG_LENGTH
      };
      let encodedPlaintext = ArrayBufferUtils.encode(plaintext);

      let encrypted = await window.crypto.subtle.encrypt(encryptOptions, key, encodedPlaintext);
      let ciphertextLength = encrypted.byteLength - ((128 + 7) >> 3);
      let ciphertext = encrypted.slice(0, ciphertextLength)
      let authenticationTag = encrypted.slice(ciphertextLength);

      return {
         ciphertext: ciphertext,
         authenticationTag: authenticationTag
      };
   }
}
