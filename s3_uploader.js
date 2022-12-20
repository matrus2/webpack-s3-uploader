const s3 = require('s3-client');
const ProgressBar = require('progress');
const _ = require('lodash');
const aws = require('aws-sdk');

const UPLOAD_IGNORES = ['.DS_Store'];

const DEFAULT_UPLOAD_OPTIONS = {
  ACL: 'public-read',
};

const REQUIRED_S3_UP_OPTS = ['Bucket'];

// eslint-disable-next-line
const addTrailingS3Sep = fPath => fPath ? fPath.replace(/\/?(\?|#|$)/, '/$1') : fPath;

const testRule = (rule, subject) => {
  if (_.isRegExp(rule)) {
    return rule.test(subject);
  } if (_.isFunction(rule)) {
    return !!rule(subject);
  } if (_.isArray(rule)) {
    return _.every(rule, condition => testRule(condition, subject));
  } if (_.isString(rule)) {
    return new RegExp(rule).test(subject);
  }
  throw new Error('Invalid include / exclude rule');
};

const handleErrors = (error, compilation) => {
  compilation.errors.push(new Error(error));
  // eslint-disable-next-line
  console.error(`Error during compilation ${error}`);
};

const isIgnoredFile = file => _.some(UPLOAD_IGNORES, ignore => new RegExp(ignore).test(file));

const getAssetFiles = ({ assets }) => {
  const files = _.map(assets, (_value, name) => ({
    name,
  }));
  return Promise.resolve(files);
};

module.exports = class S3Plugin {
  constructor(options = {}) {
    const {
      include,
      exclude,
      progress,
      s3Options = {},
      s3UploadOptions = {},
      cloudfrontInvalidateOptions = {},
    } = options;

    const basePath = options.basePath ? addTrailingS3Sep(options.basePath) : '';
    this.uploadOptions = s3UploadOptions;
    this.cloudfrontInvalidateOptions = cloudfrontInvalidateOptions;
    this.isConnected = false;

    this.options = {
      include,
      exclude,
      basePath,
      progress: _.isBoolean(progress) ? progress : true,
    };

    this.clientConfig = {
      s3Options,
      maxAsyncS3: 50,
    };
  }

  apply(compiler) {
    const hasRequiredUploadOpts = _.every(
      REQUIRED_S3_UP_OPTS,
      type => this.uploadOptions[type],
    );

    this.options.directory = compiler.options.output.path || compiler.options.output.context || '.';

    compiler.hooks.afterEmit.tap('S3Plugin', (compilation) => {
      if (!hasRequiredUploadOpts) {
        const error = `S3Plugin-RequiredS3UploadOpts: ${REQUIRED_S3_UP_OPTS.join(', ')}`;
        handleErrors(error, compilation);
      }

      this.connect();

      getAssetFiles(compilation)
        .then(files => this.filterAllowedFiles(files))
        .then(files => this.uploadFiles(files))
        .then(() => this.invalidateCloudfront())
        .catch(e => handleErrors(e, compilation));
    });
  }

  filterAllowedFiles(files) {
    const output = files.reduce((res, file) => {
      if (this.isIncludeAndNotExclude(file.name) && !isIgnoredFile(file.name)) {
        res.push(file);
      }

      return res;
    }, []);
    return Promise.resolve(output);
  }

  isIncludeAndNotExclude(file) {
    const { include, exclude } = this.options;

    const isExclude = exclude ? testRule(exclude, file) : false;
    const isInclude = include ? testRule(include, file) : true;

    return isInclude && !isExclude;
  }

  connect() {
    if (this.isConnected) {
      return;
    }
    this.client = s3.createClient(this.clientConfig);
    this.isConnected = true;
  }

  setupProgressBar(uploadFiles) {
    const progressAmount = Array(uploadFiles.length);
    const progressTotal = Array(uploadFiles.length);
    let progressTracker = 0;
    const calculateProgress = () => _.sum(progressAmount) / _.sum(progressTotal);
    const countUndefined = array =>
      _.reduce(array, (res, value) => (res += _.isUndefined(value) ? 1 : 0), 0); // eslint-disable-line

    const progressBar = new ProgressBar('Uploading [:bar] :percent :etas', {
      complete: ' ',
      incomplete: '-',
      total: 100,
    });

    uploadFiles.forEach(({ upload }, i) => {
      upload.on('progress', () => {
        const definedModifier = countUndefined(progressTotal) / 10;
        const progressValue = calculateProgress() - definedModifier;
        progressTotal[i] = this.progressTotal;
        progressAmount[i] = this.progressAmount;

        if (progressValue !== progressTracker) {
          progressBar.update(progressValue);
          progressTracker = progressValue;
        }
      });
    });
  }

  uploadFiles(files = []) {
    const uploadFiles = files.map(file => this.uploadFile(file.name));

    if (this.options.progress) {
      this.setupProgressBar(uploadFiles);
    }

    return Promise.all(uploadFiles.map(({ promise }) => promise));
  }

  uploadFile(fileName) {
    /*
         * assets not output to the webpack config output dir will have relative file name format, and ../ will crash the uploader
         * so we need to scrub them out
         *
         * example: output dir:                  dist/bundle
         *          file-loader produced output: dist/assets/someimage.png
         *          fileName:                    ../assets/someimage.png
         */
    let Key = fileName;
    const s3Params = _.mapValues(
      this.uploadOptions,
      // eslint-disable-next-line
      optionConfig => _.isFunction(optionConfig) ? optionConfig(fileName, file) : optionConfig,
    );

    // avoid noname folders in bucket
    if (Key[0] === '/') {
      Key = Key.substr(1);
    }

    // Remove Gzip from encoding if ico
    if (/\.ico/.test(fileName) && s3Params.ContentEncoding === 'gzip') {
      delete s3Params.ContentEncoding;
    }

    const upload = this.client.uploadFile({
      localFile: this.options.basePath + Key,
      s3Params: _.merge({ Key }, DEFAULT_UPLOAD_OPTIONS, s3Params),
    });

    const promise = new Promise((resolve, reject) => {
      upload.on('error', err => reject(`failed uploading file: ${fileName} with Key ${Key} err: ${err}`)); // eslint-disable-line prefer-promise-reject-errors
      upload.on('end', () => {
        resolve(fileName);
      });
    });

    return { upload, promise };
  }

  invalidateCloudfront() {
    const { clientConfig, cloudfrontInvalidateOptions } = this;

    return new Promise((resolve, reject) => {
      if (cloudfrontInvalidateOptions.DistributionId) {
        const {
          accessKeyId,
          secretAccessKey,
          sessionToken,
        } = clientConfig.s3Options;
        const cloudfront = new aws.CloudFront({
          accessKeyId,
          secretAccessKey,
          sessionToken,
        });

        cloudfront.createInvalidation(
          {
            DistributionId: cloudfrontInvalidateOptions.DistributionId,
            InvalidationBatch: {
              CallerReference: Date.now().toString(),
              Paths: {
                Quantity: cloudfrontInvalidateOptions.Items.length,
                Items: cloudfrontInvalidateOptions.Items,
              },
            },
          },
          (err, res) => {
            if (err) {
              console.error(`\n[ERROR] error creating cloudfront invalidation:  ${err}`); // eslint-disable-line no-console
            }
            err ? reject(err) : resolve(res.Id); // eslint-disable-line no-unused-expressions
          },
        );
      }
      return resolve(null);
    });
  }
};
