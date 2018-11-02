
S3 Uploader for Webpack
===  

[![Build Status](https://travis-ci.org/matrus2/webpack-s3-uploader.svg?branch=master)](https://travis-ci.org/matrus2/webpack-s3-uploader) 
  
This will upload all compiled assets to AWS S3 bucket during a webpack build process. You can serve all your files via Cloud Front or different CDN.

### Installation

```
$ npm i -S webpack-s3-uploader
```

### How to use it 

First set environmental variables:  
 
AWS_ACCESS_KEY_ID  
AWS_SECRET_ACCESS_KEY


##### Essential webpack configuration 
```javascript

// require plugin 
var S3Uploader = require('webpack-s3-uploader')


const config = {
  context: path.resolve(__dirname, '..'),

  output: {
    path: path.resolve(__dirname, '../build/public/assets'),
    publicPath: 'your_cdn_url',
  },

  plugins: [
    new S3Uploader({
      s3Options: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: 'us-west-1',
        sessionToken: 'asdsaad' // the optional AWS session token to sign requests with
      },
      s3UploadOptions: {
        Bucket: 'MyBucket'
      },
    })
  ]
  // ..other configuration
}
```  

It is required to set:  
- `output.path` is a path, where all assets will be compiled and those will be uploaded. You can use `exclude` and `include` option. 
- `output.publicPath` it is a path, where all compiled assets will be referenced to. During a compilation process webpack replaces local path with this one. If you have Cloud Front pointed to your S3 bucket, you should put url here. 

### Options

- `exclude`: A Pattern to match for excluded content (e.g. `/.*\.(css|js)/`). Behaves similarly to webpack's loader configuration.
- `include`: A Pattern to match for included content. Behaves the same as the `exclude`.
- `s3Options`: Provide keys for upload extention of [s3Config](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property)
- `s3UploadOptions`: Provide upload options [putObject](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property )
- `basePath`: Provide the namespace where upload files on S3
- `progress`: Enable progress bar (defaults true)

##### Advanced `include` and `exclude rules`

`include` and `exclude` rules behave similarly to Webpack's loader options.  In addition to a RegExp you can pass a function which will be called with the path as its first argument.  Returning a truthy value will match the rule.  You can also pass an Array of rules, all of which must pass for the file to be included or excluded.


##### Pathing for resources outside of output.path
Resources that are located outside of the webpack output.path directory are pathed as follows

```javascript
output.path = /myproject/build/dist/bundle
```

```javascript
const ASSET_OUTPUT_PATH =/myproject/build/assets

or

const ASSET_OUTPUT_PATH =../assets

...

rules [
  use: [
    ...,
    {
      loader: 'file-loader',
      options: {
        ...,
        outputPath: ASSET_OUTPUT_PATH
      }
    }
]
```

The above configuration will output to the local file system as follows

```javascript
build
|
----- dest
      |
       ---- bundle.js
|
----- assets
      |
       ---- myasset.png

and will be pathed in S3 as follows

my-bucket
|
---- bundle.js
---- assets
     |
      ---- myasset.png
```

##### Acknowledgements

This is a lite and refactored version of [s3-plugin-webpack](https://github.com/MikaAK/s3-plugin-webpack)
