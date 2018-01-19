import { API as PluginAPI } from 'jsxc/src/plugin/PluginAPI.interface'
import { EncryptionPlugin } from 'jsxc/src/plugin/EncryptionPlugin'
import { EncryptionState } from 'jsxc/src/plugin/AbstractPlugin'
import { DIRECTION, IMessage } from 'jsxc/src/Message.interface'
import { IContact } from 'jsxc/src/Contact.interface'
import Omemo from './lib/Omemo'
import { NS_BASE, NS_DEVICELIST } from './util/Const'

const MIN_VERSION = '4.0.0';
const MAX_VERSION = '4.0.0';

export default class OMEMOPlugin extends EncryptionPlugin {
   private sessions = {};
   private omemo: Omemo;

   public static getName(): string {
      return 'omemo';
   }

   constructor(pluginAPI: PluginAPI) {
      super(MIN_VERSION, MAX_VERSION, pluginAPI);

      pluginAPI.getConnection().getPEPService().subscribe(NS_DEVICELIST, this.onDeviceListUpdate)

      pluginAPI.addPreSendMessageStanzaProcessor(this.preSendMessageStanzaProcessor);

      pluginAPI.getConnection().registerHandler(this.onEncryptedOmemoStanza, NS_BASE, 'message')
   }

   public toggleTransfer(contact: IContact): Promise<void> {
      let storage = this.pluginAPI.getStorage();
      let enabled = !storage.getItem('enabled', contact.getJid().bare);
      storage.setItem('enabled', contact.getJid().bare, enabled);

      if (!enabled) {
         contact.setEncryptionState(EncryptionState.Plaintext);
         return;
      }

      return this.getOmemo().prepare().then(() => {
         contact.setEncryptionState(EncryptionState.UnverifiedEncrypted);
      });
   }

   private onDeviceListUpdate = (stanza) => {
      let messageStanza = $(stanza);
      let itemsElement = messageStanza.find(`items[node="${NS_DEVICELIST}"]`);
      let listElement = messageStanza.find(`list[xmlns="${NS_BASE}"]`);
      let fromString = messageStanza.attr('from');

      if (listElement.length !== 1 || itemsElement.length !== 1) {
         return true;
      }

      if (!fromString) {
         return true;
      }

      let fromJid = this.pluginAPI.createJID(fromString);
      let deviceIds = listElement.find('device').get().map(function(deviceElement) {
         return parseInt($(deviceElement).attr('id'));
      });

      let ownJid = this.pluginAPI.getConnection().getJID();

      if (ownJid.bare === fromJid.bare) {
         this.getOmemo().storeOwnDeviceList(deviceIds);

         //@TODO handle own update (check for own device id)
      } else {
         this.getOmemo().storeDeviceList(fromJid.bare, deviceIds);
      }

      return true;
   }

   private onEncryptedOmemoStanza = (stanza): boolean => {

      this.getOmemo().decrypt(stanza).then((decrypted) => {
         if (!decrypted) {
            return;
         }

         let messageElement = $(stanza);
         let messageType = messageElement.attr('type');
         let messageFrom = messageElement.attr('from');
         let messageTo = messageElement.attr('from');
         let messageId = messageElement.attr('id');

         let stanzaIdElement = messageElement.find('stanza-id[xmlns="urn:xmpp:sid:0"]');
         let stanzaId = stanzaIdElement.attr('id');

         let delayElement = messageElement.find('delay[xmlns="urn:xmpp:delay"]');
         let stamp = (delayElement.length > 0) ? new Date(delayElement.attr('stamp')) : new Date();

         let from = this.pluginAPI.createJID(messageFrom);

         let message = this.pluginAPI.createMessage({
            uid: stanzaId,
            attrId: messageId,
            peer: from,
            direction: DIRECTION.IN,
            plaintextMessage: decrypted,
            stamp: stamp.getTime(),
            unread: true
         });

         message.setEncrypted(true);

         let contact = this.pluginAPI.getContact(from);
         contact.getTranscript().pushMessage(message);

      }).catch((msg) => {
         console.warn('Omemo Warning:', msg);
      });

      //@TODO generate message object and add it to the transcript

      return true;
   }

   private preSendMessageStanzaProcessor = (message: IMessage, xmlElement: Strophe.Builder) => {
      let contact = this.pluginAPI.getContact(message.getPeer());

      if (!contact) {
         console.warn('Could not find contact');
         return Promise.resolve([message, xmlElement]);
      }

      let enabled = !!this.pluginAPI.getStorage().getItem('enabled', contact.getJid().bare);

      if (!enabled) {
         return Promise.resolve([message, xmlElement]);
      }

      return this.getOmemo().encrypt(contact, message, xmlElement);
   }

   private getOmemo() {
      if (!this.omemo) {
         this.omemo = new Omemo(this.pluginAPI.getStorage(), this.pluginAPI.getConnection());
      }

      return this.omemo;
   }
}
