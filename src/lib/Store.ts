//import Storage from '../../../Storage'
import { SignalProtocolAddress } from '../vendor/Signal'
import { SignalBundleObject } from './ObjectTypes'
import Bundle from './Bundle'
import ArrayBufferUtils from '../util/ArrayBuffer'
import { NS_BASE, NS_BUNDLES } from '../util/Const'

const PREFIX = 'store';
const PREFIX_SESSION = 'session:';
const PREFIX_IDENTITYKEY = 'identityKey:';
const PREFIX_PREKEY = '25519KeypreKey:';
const PREFIX_SIGNEDPREKEY = '25519KeysignedKey:';

//@TODO create SignalStore interface in order to know which functions are required by Signal

export default class Store {
   public Direction = {
      SENDING: 1,
      RECEIVING: 2
   };

   constructor(private storage, private pepService) { //@TODO add ts type

   }

   public getOwnDeviceList(): number[] {
      return this.get('deviceList', []);
   }

   public setOwnDeviceList(deviceList: number[]) {
      this.put('deviceList', deviceList);
   }

   public getDeviceList(identifier) {
      return this.get('deviceList:' + identifier, []);
   }

   public setDeviceList(identifier, deviceList: number[]) {
      this.put('deviceList:' + identifier, deviceList);
   }

   public isReady(): boolean {
      return this.get('deviceId') && this.get('identityKey') && this.get('registrationId');
   }

   public isPublished(): boolean {
      return this.get('published') === 'true' || this.get('published') === true;
   }

   public getIdentityKeyPair() {
      return Promise.resolve(this.get('identityKey'));
   }

   public getLocalRegistrationId() {
      return Promise.resolve(this.get('registrationId'));
   }

   public getDeviceId() {
      return parseInt(this.get('deviceId'));
   }

   public put(key, value) {
      if (key === undefined || value === undefined || key === null || value === null)
         throw new Error('Tried to store undefined/null');

      //@REVIEW serialization is done in storage.setItem
      let stringified = JSON.stringify(value, function(key, value) {
         if (value instanceof ArrayBuffer) {
            return ArrayBufferUtils.toArray(value)
         }

         return value;
      });

      this.storage.setItem(PREFIX, key, { v: stringified });
   }

   public get(key, defaultValue?) {
      if (key === null || key === undefined)
         throw new Error('Tried to get value for undefined/null key');

      let data = this.storage.getItem(PREFIX, key);

      if (data) {
         return JSON.parse(data.v, function(key, value) {
            if (/Key$/.test(key)) {
               return ArrayBufferUtils.fromArray(value);
            }

            return value;
         });
      }

      return defaultValue;
   }

   public remove(key) {
      if (key === null || key === undefined)
         throw new Error('Tried to remove value for undefined/null key');

      this.storage.removeItem(PREFIX, key);
   }

   public isTrustedIdentity(identifier, identityKey) {
      if (identifier === null || identifier === undefined) {
         throw new Error('tried to check identity key for undefined/null key');
      }

      if (!(identityKey instanceof ArrayBuffer)) {
         throw new Error('Expected identityKey to be an ArrayBuffer');
      }

      let trusted = this.get(PREFIX_IDENTITYKEY + identifier);
      if (trusted === undefined) {
         return Promise.resolve(true);
      }

      return Promise.resolve(ArrayBufferUtils.isEqual(identityKey, trusted));
   }

   public loadIdentityKey(identifier) {
      if (identifier === null || identifier === undefined)
         throw new Error('Tried to get identity key for undefined/null key');

      return Promise.resolve(this.get(PREFIX_IDENTITYKEY + identifier));
   }

   public saveIdentity(identifier, identityKey) {
      if (identifier === null || identifier === undefined)
         throw new Error('Tried to put identity key for undefined/null key');

      let address = new SignalProtocolAddress.fromString(identifier);

      let existing = this.get(PREFIX_IDENTITYKEY + address.getName());
      this.put(PREFIX_IDENTITYKEY + address.getName(), identityKey); //@REVIEW stupid?

      return Promise.resolve(existing && ArrayBufferUtils.isEqual(identityKey, existing));
   }

   public loadPreKey(keyId: number) {
      let res = this.get(PREFIX_PREKEY + keyId);
      if (res !== undefined) {
         res = { pubKey: res.pubKey, privKey: res.privKey };
      }

      return Promise.resolve(res);
   }

   public storePreKey(keyId: number, keyPair) {
      return Promise.resolve(this.put(PREFIX_PREKEY + keyId, keyPair));
   }

   public removePreKey(keyId: number) {
      //@TODO publish new bundle

      return Promise.resolve(this.remove(PREFIX_PREKEY + keyId));
   }

   public loadSignedPreKey(keyId: number) {
      let res = this.get(PREFIX_SIGNEDPREKEY + keyId);
      if (res !== undefined) {
         res = { pubKey: res.pubKey, privKey: res.privKey };
      }

      return Promise.resolve(res);
   }

   public storeSignedPreKey(keyId: number, keyPair) {
      return Promise.resolve(this.put(PREFIX_SIGNEDPREKEY + keyId, keyPair));
   }

   public removeSignedPreKey(keyId: number) {
      return Promise.resolve(this.remove(PREFIX_SIGNEDPREKEY + keyId));
   }

   public loadSession(identifier) {
      return Promise.resolve(this.get(PREFIX_SESSION + identifier));
   }

   public storeSession(identifier, record) {
      return Promise.resolve(this.put(PREFIX_SESSION + identifier, record));
   }

   public removeSession(identifier) {
      return Promise.resolve(this.remove(PREFIX_SESSION + identifier));
   }

   public hasSession(identifier): boolean {
      return !!this.get(PREFIX_SESSION + identifier)
   }

   public removeAllSessions(identifier) {
      //@TODO implement removeAllSessions
      // for (var id in this.store) {
      //    if (id.startsWith(this.prefix + ':' + 'session' + identifier)) {
      //       localStorage.removeItem(this.prefix + ':' + id);
      //    }
      // }
      return Promise.resolve();
   }

   public async getPreKeyBundle(address): Promise<SignalBundleObject> {
      let node = NS_BUNDLES + address.getDeviceId();
      let stanza;

      try {
         stanza = await this.pepService.retrieveItems(node, address.getName());
      } catch (errorStanza) {
         console.log('Error while retrieving bundle', errorStanza);

         throw 'Could not retrieve bundle';
      }


      let itemsElement = $(stanza).find(`items[node='${node}']`);
      let bundleElement = itemsElement.find(`bundle[xmlns='${NS_BASE}']`);

      if (bundleElement.length !== 1) {
         return Promise.reject('Found no bundle');
      }

      let bundle = Bundle.fromXML(bundleElement.get());

      //@REVIEW registrationId??? Gajim uses probably own registration id.
      return bundle.toSignalBundle(address.getDeviceId())
   }
}
