import s3 from 's3-client';
import ProgressBar from 'progress';
import * as _ from 'lodash';
import aws from 'aws-sdk';
import { RuleSetCondition, Compiler, compilation } from 'webpack';

const PLUGIN_NAME = 'WebpackS3UploaderPlugin';

const UPLOAD_IGNORES = ['.DS_Store'];

const DEFAULT_UPLOAD_OPTIONS = {
  ACL: 'public-read',
};

const REQUIRED_S3_UP_OPTS = ['Bucket'];

const addTrailingS3Sep = (fPath: string) =>
  fPath ? fPath.replace(/\/?(\?|#|$)/, '/$1') : fPath;

const testRule = (rule: RuleSetCondition, subject: string): any => {
  if (_.isRegExp(rule)) {
    return rule.test(subject);
  }

  if (_.isFunction(rule)) {
    return !!rule(subject);
  }

  if (_.isArray(rule)) {
    return _.some(rule, condition => testRule(condition, subject));
  }

  if (_.isString(rule)) {
    return new RegExp(rule).test(subject);
  }

  throw new Error('Invalid include / exclude rule');
};

type AssetFile = {
  name: string;
  path: string;
};

type UploadFile = {
  promise: Promise<string>; // resolves with the file path
  upload: LooseObject; // return of s3Client.uploadFile
};

type LooseObject = {
  [key: string]: any;
};

type Options = {
  basePath: string;
  progress: boolean;
  include?: RuleSetCondition | RuleSetCondition[];
  exclude?: RuleSetCondition | RuleSetCondition[];
  s3Options?: LooseObject;
  s3UploadOptions?: LooseObject;
  cloudfrontInvalidateOptions?: LooseObject;
};

const isIgnoredFile = (file: string) =>
  _.some(UPLOAD_IGNORES, ignore => new RegExp(ignore).test(file));

const getAssetFiles = ({
  assets,
}: compilation.Compilation): Promise<AssetFile[]> => {
  const files = _.map(assets, (value, name) => ({
    name,
    path: value.existsAt,
  }));

  return Promise.resolve(files);
};

export default class S3Plugin {
  options: Options & {
    directory?: string;
  };

  uploadOptions: LooseObject;

  cloudfrontInvalidateOptions: LooseObject;

  isConnected: boolean;

  clientConfig: {
    s3Options: LooseObject;
    maxAsyncS3: number;
  };

  client?: LooseObject;

  constructor(options: Partial<Options> = {}) {
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

  apply(compiler: Compiler) {
    this.connect();
    const hasRequiredUploadOpts = _.every(
      REQUIRED_S3_UP_OPTS,
      type => this.uploadOptions[type]
    );

    this.options.directory =
      (compiler.options.output && compiler.options.output.path) || '.';

    compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, compilation => {
      if (!hasRequiredUploadOpts) {
        const error = `S3Plugin-RequiredS3UploadOpts: ${REQUIRED_S3_UP_OPTS.join(
          ', '
        )}`;

        return Promise.reject(new TypeError(error));
      }

      return getAssetFiles(compilation)
        .then(files => this.filterAllowedFiles(files))
        .then(files => this.uploadFiles(files))
        .then(() => this.invalidateCloudfront());
    });
  }

  filterAllowedFiles(files: AssetFile[]): Promise<AssetFile[]> {
    const output = files.reduce(
      (res, file) => {
        if (
          this.isIncludeAndNotExclude(file.name) &&
          !isIgnoredFile(file.name)
        ) {
          res.push(file);
        }

        return res;
      },
      [] as AssetFile[]
    );

    return Promise.resolve(output);
  }

  isIncludeAndNotExclude(filename: string): boolean {
    const { include, exclude } = this.options;

    const isExclude = exclude ? testRule(exclude, filename) : false;
    const isInclude = include ? testRule(include, filename) : true;

    return isInclude && !isExclude;
  }

  connect(): void {
    if (this.isConnected) {
      return;
    }

    this.client = s3.createClient(this.clientConfig);
    this.isConnected = true;
  }

  setupProgressBar(uploadFiles: UploadFile[]) {
    const progressAmount: Array<number | void> = Array(uploadFiles.length);
    const progressTotal: Array<number | void> = Array(uploadFiles.length);
    let progressTracker = 0;
    const calculateProgress = () =>
      _.sum(progressAmount) / _.sum(progressTotal);
    const countUndefined = (array: Array<number | void>) =>
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
        progressTotal[i] = upload.progressTotal;
        progressAmount[i] = upload.progressAmount;

        if (progressValue !== progressTracker) {
          progressBar.update(progressValue);
          progressTracker = progressValue;
        }
      });
    });
  }

  uploadFiles(files: AssetFile[] = []) {
    const uploadFiles = files.map(file =>
      this.uploadFile(file.name, file.path)
    );

    if (this.options.progress) {
      this.setupProgressBar(uploadFiles);
    }

    return Promise.all(uploadFiles.map(({ promise }) => promise));
  }

  uploadFile(fileName: string, filePath: string): UploadFile {
    if (!this.client) {
      throw new Error('Client is not connected');
    }
    /*
     * assets not output to the webpack config output dir will have relative file name format, and ../ will crash the uploader
     * so we need to scrub them out
     *
     * example: output dir:                  dist/bundle
     *          file-loader produced output: dist/assets/someimage.png
     *          fileName:                    ../assets/someimage.png
     */
    // eslint-disable-next-line no-param-reassign
    fileName = fileName.split('../').join('');

    let Key = this.options.basePath + fileName;
    const s3Params = _.mapValues(this.uploadOptions, (
      optionConfig // eslint-disable-line no-confusing-arrow
    ) =>
      _.isFunction(optionConfig)
        ? optionConfig(fileName, filePath)
        : optionConfig
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
      localFile: filePath,
      s3Params: _.merge({ Key }, DEFAULT_UPLOAD_OPTIONS, s3Params),
    });

    const promise: Promise<string> = new Promise((resolve, reject) => {
      upload.on('error', (err: Error) =>
        reject(`failed uplaoding file: ${filePath} with Key ${Key} err: ${err}`)
      ); // eslint-disable-line prefer-promise-reject-errors
      upload.on('end', () => resolve(filePath));
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
              reject(err);
            } else if (!res.Invalidation) {
              reject(new Error('Empty invalidation response'));
            } else {
              resolve(res.Invalidation.Id);
            }
          }
        );
      }

      return resolve(null);
    });
  }
}
