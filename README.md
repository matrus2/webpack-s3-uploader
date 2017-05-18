
S3 Uploader for Webpack
===  

[![Build Status](https://travis-ci.org/matrus2/webpack-s3-uploader.svg?branch=master)](https://travis-ci.org/matrus2/webpack-s3-uploader) 
[![NSP Status](https://nodesecurity.io/orgs/matrus/projects/9163c5b1-e10a-43c0-9889-27f7ad71ec8f/badge)](https://nodesecurity.io/orgs/matrus/projects/9163c5b1-e10a-43c0-9889-27f7ad71ec8f)  
  
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
        region: 'us-west-1'
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


##### Acknowledgements

This is a lite and refactored version of [s3-plugin-webpack](https://github.com/MikaAK/s3-plugin-webpack)
