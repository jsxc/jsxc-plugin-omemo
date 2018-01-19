/* jshint node:true */
var path = require("path");
var ExtractTextPlugin = require('extract-text-webpack-plugin');

module.exports = {
   entry: ['./src/Plugin.ts'],
   output: {
      filename: '[name].bundle.js',
      path: path.resolve(__dirname, './dist/'),
      libraryTarget: 'umd',
      library: 'OMEMOPlugin',
      pathinfo: true
   },
   node: {
      fs: 'empty'
   },
   module: {
      rules: [{
            test: /\.ts$/,
            loader: 'ts-loader',
            exclude: /node_modules/,
         }
      ]
   },
   resolve: {
      extensions: [".ts", ".js"]
   },
   externals: {
      'jquery': 'jQuery',
      'jsxc': 'jsxc'
   }
};
