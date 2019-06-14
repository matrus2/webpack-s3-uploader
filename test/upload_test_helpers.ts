import * as _ from 'lodash';
import webpack from 'webpack';

import s3Opts from './s3_options';
import S3WebpackPlugin from '../src/webpack-s3-uploader';

const S3_URL = s3Opts.AWS_S3_URL;
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
  S3_URL,
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
};
