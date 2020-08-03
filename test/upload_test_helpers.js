const _ = require('lodash');
const https = require('https');
const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const s3Opts = require('./s3_options');
const S3WebpackPlugin = require('../s3_uploader');
const { assert } = require('chai');
const { spawnSync } = require('child_process');
const ExtractTextPlugin = require('extract-text-webpack-plugin');

const S3_URL = s3Opts.AWS_S3_URL;
const S3_ERROR_REGEX = /<Error>/;
const OUTPUT_FILE_NAME = 's3Test';
const OUTPUT_PATH = path.resolve(__dirname, '.tmp');
const FIXTURES_PATH = path.resolve(__dirname, 'fixtures');
const ENTRY_PATH = path.resolve(__dirname, 'fixtures/index.js');
const createBuildFailError = errors => `Webpack Build Failed ${errors}`;

const ASSET_FILE_NAME_PATTERN = '[name]@[hash].[ext]';
const ASSET_PATH = '/assets';
const ASSET_OUTPUT_RELATIVE_PATH = `..${ASSET_PATH}`;

const deleteFolderRecursive = (folder) => {
  if (fs.existsSync(folder)) {
    fs.readdirSync(folder).forEach((file) => {
      const curPath = path.join(folder, file);

      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });

    fs.rmdirSync(folder);
  }
};

const generateS3Config = (config) => {
  const params = _.merge({}, {
    s3Options: s3Opts.s3Options,
    s3UploadOptions: s3Opts.s3UploadOptions,
    progress: false,
  }, config);

  return new S3WebpackPlugin(params);
};

module.exports = {
  OUTPUT_FILE_NAME,
  OUTPUT_PATH,
  S3_URL,
  S3_ERROR_REGEX,
  FIXTURES_PATH,

  fetch(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        let body = '';
        response.on('data', data => (body += data)); // eslint-disable-line no-return-assign
        response.on('end', () => resolve(body));
        response.on('error', reject);
      });
    });
  },

  addSlashToPath(pathName) {
    if (!pathName) {
      return pathName;
    }
    return pathName.endsWith(path.sep) ? pathName : pathName + path.sep;
  },

  createFolder(pathToFolder) {
    spawnSync('mkdir', ['-p', pathToFolder], { stdio: 'inherit' });
  },

  testForFailFromStatsOrGetS3Files({ errors, stats }) {
    if (errors) {
      return assert.fail([], errors, createBuildFailError(errors));
    }
    return this.getBuildFilesFromS3(this.getFilesFromStats(stats));
  },

  testForFailFromDirectoryOrGetS3Files(directory, bPath = '') {
    return ({ errors }) => {
      const basePath = this.addSlashToPath(`${directory}`);

      if (errors) {
        return assert.fail([], errors, createBuildFailError(errors));
      }
      return this.getBuildFilesFromS3(this.getFilesFromDirectory(directory, basePath), bPath);
    };
  },

  cleanOutputDirectory() {
    deleteFolderRecursive(OUTPUT_PATH);
  },

  createOutputPath(outputPath = OUTPUT_PATH) {
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath);
    }
  },

  createRandomFile(newPath) {
    const hash = Math.floor(Math.random() * 10000);
    const fileName = `random-file-${hash}`;
    const newFileName = `${newPath}/${fileName}.txt`;

    // Create Random File to upload
    fs.writeFileSync(newFileName, `This is a new file - ${hash}`);

    return { fullPath: newFileName, fileName };
  },

  createWebpackConfig({ config, s3Config } = {}) {
    return _.extend({
      entry: ENTRY_PATH,
      module: {
        rules: [
          {
            test: /\.png/,
            loader: 'file-loader',
            options: {
              name: '[name].[ext]',
            }
          },
          {
            test: /\.css$/,
            loader: ExtractTextPlugin.extract('css-loader'),
          },
        ],
      },
      plugins: [
        new ExtractTextPlugin('styles/styles.css'),
        generateS3Config(s3Config),
      ],
      output: {
        path: OUTPUT_PATH,
        filename: `${OUTPUT_FILE_NAME}-[hash]-${+new Date()}.js`,
      },
    }, config);
  },

  createAlternatePathingWebpackConfig({ config, s3Config } = {}) {
    return _.extend({
      entry: ENTRY_PATH,
      module: {
        rules: [{
          test: /\.png/,
          loader: `file-loader?name=${ASSET_FILE_NAME_PATTERN}?publicPath=${ASSET_PATH}&outputPath=${ASSET_OUTPUT_RELATIVE_PATH}`,
        }, {
          test: /\.css$/,
          loader: ExtractTextPlugin.extract('css-loader'),
        }],
      },
      plugins: [
        new ExtractTextPlugin('styles/styles.css'),
        generateS3Config(s3Config),
      ],
      output: {
        path: OUTPUT_PATH,
        filename: `${OUTPUT_FILE_NAME}-[hash]-${+new Date()}.js`,
      },
    }, config);
  },

  runWebpackConfig({ config }) {
    this.createOutputPath(config.output.path);

    return new Promise((resolve, reject) => {
      webpack(config, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }
        if (stats.toJson().errors.length) {
          resolve({ errors: stats.toJson().errors });
        } else {
          resolve({ config, stats });
        }
      });
    });
  },

  getFilesFromDirectory(directory, basePath) {
    const res = (function readDirectory(dir) {
      return fs.readdirSync(dir)
        .reduce((out, file) => {
          const fPath = path.resolve(dir, file);

          if (fs.lstatSync(fPath).isDirectory()) {
            out.push(...readDirectory(fPath));
          } else {
            out.push(fPath);
          }

          return out;
        }, []);    }).call(this, directory);

    return res
      .map(file => file.replace(basePath, ''));
  },

  getFilesFromStats(stats) {
    return _.map(stats.toJson().assets, 'name');
  },

  getBuildFilesFromS3(files, basePath = '') {
    const fetchFiles = files
      .filter(file => !/.*\.html$/.test(file));
    const bPath = this.addSlashToPath(basePath);
    return Promise.all(fetchFiles.map(file => this.fetch(S3_URL + bPath + file)))
      .then(nFiles => nFiles.map((file, i) => {
        const fetchFile = fetchFiles[i];

        return {
          name: fetchFile,
          s3Url: S3_URL + bPath + fetchFile,
          actual: file,
          expected: this.readFileFromOutputDir(fetchFile),
        };
      }));
  },

  readFileFromOutputDir(file) {
    return fs.readFileSync(path.resolve(OUTPUT_PATH, file)).toString();
  },

  testForErrorsOrGetFileNames({ stats, errors }) {
    if (errors) {
      return assert.fail([], errors, createBuildFailError(errors));
    }
    return this.getFilesFromStats(stats);
  },

  assertFileMatches(files) {
    const errors = _(files)
      .map(({
        expected, actual, name, s3Url,
      }) =>
        assert.equal(actual, expected, `File: ${name} URL: ${s3Url} - NO MATCH ${expected} ------ ${actual}`))
      .compact()
      .value();

    return Promise.all(_.some(errors) ? errors : files);
  },

  getCloudfrontInvalidateOptions() {
    return s3Opts.cloudfrontInvalidateOptions;
  },
};
