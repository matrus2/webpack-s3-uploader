import * as _ from 'lodash';
import webpack from 'webpack';
import s3Client from 's3-client';
import { EventEmitter } from 'events';

import s3Opts from './s3_options';
import S3WebpackPlugin from '../src/webpack-s3-uploader';

const S3_ERROR_REGEX = /<Error>/;
const OUTPUT_FILE_NAME = 's3Test';

type LooseObject = {
  [key: string]: any;
};

const generateS3Config = (config: LooseObject = {}) => {
  const params = {
    s3Options: s3Opts.s3Options,
    s3UploadOptions: s3Opts.s3UploadOptions,
    progress: false,
    ...config,
  };

  return new S3WebpackPlugin(params);
};

export default {
  OUTPUT_FILE_NAME,
  S3_ERROR_REGEX,

  createWebpackConfig(
    entryPath,
    outputPath,
    { config, s3Config }: { config?: any; s3Config: any }
  ) {
    return _.extend(
      {
        entry: entryPath,
        module: {
          rules: [
            {
              test: /\.(png|jpg)$/,
              loader: 'file-loader?name=[name]-[hash].[ext]',
            },
          ],
        },
        plugins: [generateS3Config(s3Config)],
        output: {
          path: outputPath,
          filename: `${OUTPUT_FILE_NAME}-[hash]-${+new Date()}.js`,
        },
      },
      config
    );
  },

  runWebpackConfig<C extends object>({
    config,
  }: {
    config: C;
  }): Promise<{ config: C; stats: webpack.Stats }> {
    return new Promise((resolve, reject) => {
      webpack(config, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }

        if (stats.toJson().errors.length) {
          reject({ errors: stats.toJson().errors });
        } else {
          resolve({ config, stats });
        }
      });
    });
  },

  mockS3Client(options: { withProgress?: boolean; withError?: Error } = {}) {
    class FakeS3Client {
      uploadFile({ localFile, s3Params }) {
        const uploader: any = new EventEmitter();

        if (options.withError) {
          setTimeout(() => {
            uploader.emit('error', options.withError);
          }, 0);
        }

        uploader.progressAmount = 0;
        uploader.progressTotal = 0;

        setTimeout(() => {
          uploader.progressAmount = 20;
          uploader.progressTotal = 20;
          uploader.emit('progress');
        }, 0);

        setTimeout(() => {
          uploader.progressAmount = 53;
          uploader.progressTotal = 73;
          uploader.emit('progress');
        }, 0);

        setTimeout(() => {
          uploader.progressAmount = 27;
          uploader.progressTotal = 100;
          uploader.emit('progress');
        }, 0);

        setTimeout(() => {
          uploader.emit('end');
          s3Client.__uploadedFiles.push({
            localFile,
            s3Path: s3Params.Bucket + '/' + s3Params.Key,
          });
        }, 5);

        return uploader;
      }
    }

    s3Client.__uploadedFiles = [];
    s3Client.createClient = jest.fn().mockImplementation(() => {
      return new FakeS3Client();
    });
  },
};
