# OMEMO Plugin for JSXC 4

This plugin adds [OMEMO (XEP-0384)][OMEMO] to [JSXC] version 4 or above.

:warning: This plugin is still in development.

## How to use
1. Build either with `npm install && npm start` or `yarn && yarn start`. The result will be in `dist/`.
2. Include [libsignal], JSXC and your previous generated bundle into your website.
3. Add the plugin to JSXC with `jsxc.addPlugin(OMEMOPlugin);`.
4. Enjoy secure communication :tada:.

## Example
```
<link href="node_modules/jsxc/dist/styles/main.bundle.css" media="all" rel="stylesheet" type="text/css" />

<script src="node_modules/jquery/dist/jquery.js"></script>
<script src="node_modules/libsignal-protocol/dist/libsignal-protocol.js"></script>
<script src="node_modules/jsxc/dist/main.bundle.js"></script>

<script>
jsxc.addPlugin(OMEMOPlugin);
jsxc.start('/http-bind/', 'foo@bar', 'passw0rd');
</script>
```

## Security considerations
Please beware that all your private keys will be in the local storage of your website.

[OMEMO]:https://xmpp.org/extensions/xep-0384.html
[JSXC]:https://www.jsxc.org
[libsignal]:https://github.com/signalapp/libsignal-protocol-javascript
