
S3 Uploader for Webpack
===

This will upload all compiled assets to AWS S3 bucket during a webpack build process. 

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

#####Notes:
It is required to set:  
- `output.path` is a path, where all assets will be compiled and those will be uploaded. You can use `exclude` and `include` option. 
- `output.publicPath` it is a path, where all compiled assets will be referenced to. During a compilation process webpack replace local path with this one. 


      // Only upload css and js
      include: /.*\.(css|js)/,



### Options

- `exclude`: A Pattern to match for excluded content. Behaves similarly to webpack's loader configuration.
- `include`: A Pattern to match for included content. Behaves the same as the `exclude`.
- `s3Options`: Provide keys for upload extention of [s3Config](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property)
- `s3UploadOptions`: Provide upload options [putObject](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property )
- `basePath`: Provide the namespace where upload files on S3
- `progress`: Enable progress bar (defaults true)

##### Advanced `include` and `exclude rules`

`include` and `exclude` rules behave similarly to Webpack's loader options.  In addition to a RegExp you can pass a function which will be called with the path as its first argument.  Returning a truthy value will match the rule.  You can also pass an Array of rules, all of which must pass for the file to be included or excluded.


##### Acknowledges

This is lite version of [s3-plugin-webpack](https://github.com/MikaAK/s3-plugin-webpack) 
