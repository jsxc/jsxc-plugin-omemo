import {IContact as Contact} from 'jsxc/src/Contact.interface'
import {IMessage as Message} from 'jsxc/src/Message.interface'
import { IConnection } from 'jsxc/src/connection/Connection.interface'
import Store from './Store'
import Peer from './Peer'
import Bootstrap from './Bootstrap'
import JID from 'jsxc/src/JID' //@TODO
import {IJID} from 'jsxc/src/JID.interface'
import Stanza from '../util/Stanza'
import { NS_BASE, AES_TAG_LENGTH } from '../util/Const'
import ArrayBufferUtils from '../util/ArrayBuffer'

export default class Omemo {
   private store: Store;

   private peers: any = {};

   private bootstrap: Bootstrap;

   constructor(private storage, private connection: IConnection) {
      this.store = new Store(storage, connection.getPEPService());

      Peer.setOwnJid(connection.getJID());
   }

   public storeOwnDeviceList(deviceList: number[]) {
      this.store.setOwnDeviceList(deviceList);
   }

   public storeDeviceList(identifier: string, deviceList: number[]) {
      this.store.setDeviceList(identifier, deviceList);
   }

   public prepare(): Promise<void> {
      if (!this.bootstrap) {
         this.bootstrap = new Bootstrap(this.store, this.connection);
      }

      return this.bootstrap.prepare();
   }

   public encrypt(contact: Contact, message: Message, xmlElement: Strophe.Builder) {
      let peer = this.getPeer(contact.getJid());

      return peer.encrypt(message.getPlaintextMessage()).then((encryptedMessages) => {
         let stanza = Stanza.buildEncryptedStanza(encryptedMessages, this.store.getDeviceId());

         $(xmlElement.tree()).find(`html[xmlns="${Strophe.NS.XHTML_IM}"]`).remove();
         $(xmlElement.tree()).find('>body').remove();

         xmlElement.cnode(stanza.tree());
         xmlElement.up().c('store', {
            xmlns: 'urn:xmpp:hints'
         }).up();

         message.setEncrypted(true);

         return [message, xmlElement];
      }).catch((msg) => {
         console.warn(msg); //@TODO show warning

         return [message, xmlElement];
      });
   }

   public async decrypt(stanza): Promise<string | void> {
      let messageElement = $(stanza);

      if (messageElement.prop('tagName') !== 'message') {
         throw 'Root element is no message element';
      }

      let encryptedElement = $(stanza).find(`>encrypted[xmlns="${NS_BASE}"]`);

      if (encryptedElement.length === 0) {
         throw 'No encrypted stanza found';
      }

      let from = new JID(messageElement.attr('from'));
      let encryptedData = Stanza.parseEncryptedStanza(encryptedElement);

      if (!encryptedData) {
         throw 'Could not parse encrypted stanza';
      }

      let ownDeviceId = this.store.getDeviceId();
      let ownPreKeyFiltered = encryptedData.keys.filter(function(preKey) {
         return ownDeviceId === preKey.deviceId;
      });

      if (ownPreKeyFiltered.length !== 1) {
         return Promise.reject(`Found ${ownPreKeyFiltered.length} PreKeys which match my device id (${ownDeviceId}).`);
      }

      let ownPreKey = ownPreKeyFiltered[0]; //@TODO rename var
      let peer = this.getPeer(from);
      let exportedKey;

      try {
         exportedKey = await peer.decrypt(encryptedData.sourceDeviceId, ownPreKey.ciphertext, ownPreKey.preKey);
      } catch (err) {
         throw 'Error during decryption: ' + err;
      }

      let exportedAESKey = exportedKey.slice(0, 16);
      let authenticationTag = exportedKey.slice(16);

      if (authenticationTag.byteLength !== 16) {
         //@TODO authentication tag is also allowed to be larger
         throw "Authentication tag too short";
      }

      let iv = (<any>encryptedData).iv;
      let ciphertextAndAuthenticationTag = ArrayBufferUtils.concat((<any>encryptedData).payload, authenticationTag);

      return this.decryptWithAES(exportedAESKey, iv, ciphertextAndAuthenticationTag);
   }

   private async decryptWithAES(exportedAESKey: ArrayBuffer, iv, data: ArrayBuffer): Promise<string> {
      let key = await window.crypto.subtle.importKey('raw', exportedAESKey, {
         name: 'AES-GCM'
      }, false, ['decrypt']);

      let decryptedBuffer = await window.crypto.subtle.decrypt({
         name: 'AES-GCM',
         iv: iv,
         tagLength: AES_TAG_LENGTH
      }, key, data);

      return ArrayBufferUtils.decode(decryptedBuffer);
   }

   private getPeer(jid: IJID): Peer {
      if (!this.peers[jid.bare]) {
         this.peers[jid.bare] = new Peer(jid, this.store);
      }

      return this.peers[jid.bare];
   }
}
