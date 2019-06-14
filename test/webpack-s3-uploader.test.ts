/* eslint-env mocha */
import _ from 'lodash';
import s3Client from 's3-client';
import ProgressBar from 'progress';
import awsSdk from 'aws-sdk';
import {
  getFixturePathSync,
  createTempDirSync,
  cleanupTempDirs,
} from 'jest-fixtures';

import { PLUGIN_NAME } from '../src/webpack-s3-uploader';
import testHelpers from './upload_test_helpers';
import s3_options from './s3_options';

const OUTPUT_DIR = createTempDirSync();
const ENTRY_PATH = getFixturePathSync(__dirname, 'index.js');

jest.mock('aws-sdk');
jest.mock('s3-client');
jest.mock('progress');
jest.setTimeout(30000);

afterAll(() => {
  return cleanupTempDirs();
});

beforeEach(() => {
  (ProgressBar as any).mockClear();
  (s3Client.createClient as any).mockClear();
  (awsSdk.CloudFront as any).mockClear();
});

describe('Constructor', () => {
  test('throws without required config', async () => {
    const s3Config = {
      s3UploadOptions: {
        Bucket: '',
      },
    };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });

    await expect(
      testHelpers.runWebpackConfig({ config })
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe('Successful cases', () => {
  beforeEach(() => {
    testHelpers.mockS3Client();
  });

  test('uploads entire directory to s3', async () => {
    const basePath = 'test';
    const s3Config = { basePath };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });
    const compilation = await testHelpers.runWebpackConfig({ config });
    const assets = compilation.stats.toJson().assets;

    expect(assets.length).toBe(s3Client.__uploadedFiles.length);

    assets.forEach(asset => {
      const fileName = OUTPUT_DIR + '/' + asset.name;
      const uploadedFile = _.find(s3Client.__uploadedFiles, {
        localFile: fileName,
      });

      expect(uploadedFile).toBeTruthy();
    });
  });

  test('includes files', async () => {
    const basePath = 'test';
    const s3Config = { basePath, include: /image/ };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });
    const compilation = await testHelpers.runWebpackConfig({ config });
    const assets = compilation.stats.toJson().assets;

    expect(assets.length).toBe(3);
    expect(s3Client.__uploadedFiles.length).toBe(2);

    const expectedFiles = s3Client.__uploadedFiles.filter(uploadedFile => {
      return uploadedFile.localFile.includes('image');
    });

    expect(expectedFiles.length).toBe(2);
  });

  test('excludes files', async () => {
    const basePath = 'test';
    const s3Config = { basePath, exclude: /image/ };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });
    const compilation = await testHelpers.runWebpackConfig({ config });
    const assets = compilation.stats.toJson().assets;

    expect(assets.length).toBe(3);
    expect(s3Client.__uploadedFiles.length).toBe(1);

    const expectedFiles = s3Client.__uploadedFiles.filter(uploadedFile => {
      return uploadedFile.localFile.includes(testHelpers.OUTPUT_FILE_NAME);
    });

    expect(expectedFiles.length).toBe(1);
  });

  test('includes some files and excludes others', async () => {
    const basePath = 'test';
    const s3Config = {
      basePath,
      include: [testHelpers.OUTPUT_FILE_NAME, /image/],
      exclude: 'png',
    };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });
    const compilation = await testHelpers.runWebpackConfig({ config });
    const assets = compilation.stats.toJson().assets;

    expect(assets.length).toBe(3);
    expect(s3Client.__uploadedFiles.length).toBe(2);

    const expectedFiles = s3Client.__uploadedFiles.filter(uploadedFile => {
      return (
        uploadedFile.localFile.includes(testHelpers.OUTPUT_FILE_NAME) ||
        uploadedFile.localFile.includes('.jpg')
      );
    });

    expect(expectedFiles.length).toBe(2);
  });

  test('includes as a function', async () => {
    const basePath = 'test';
    const s3Config = {
      basePath,
      include: filename => filename.includes(testHelpers.OUTPUT_FILE_NAME),
    };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });
    const compilation = await testHelpers.runWebpackConfig({ config });
    const assets = compilation.stats.toJson().assets;

    expect(assets.length).toBe(3);
    expect(s3Client.__uploadedFiles.length).toBe(1);
    expect(s3Client.__uploadedFiles[0].localFile).toContain(
      testHelpers.OUTPUT_FILE_NAME
    );
  });

  test('s3UploadOptions.Bucket as function', async () => {
    const basePath = 'test';
    const s3Config = {
      basePath,
      include: testHelpers.OUTPUT_FILE_NAME,
      s3UploadOptions: {
        Bucket: (filename, filepath) => {
          expect(filename).toContain(testHelpers.OUTPUT_FILE_NAME);
          expect(filepath).toContain(OUTPUT_DIR);
          return 'bucket-from-fn';
        },
      },
    };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });

    await testHelpers.runWebpackConfig({ config });

    const s3PathPartial = `bucket-from-fn/${basePath}/${testHelpers.OUTPUT_FILE_NAME}`;

    expect(s3Client.__uploadedFiles[0].s3Path).toContain(s3PathPartial);
  });

  test('fails with invalid "include"', async () => {
    const basePath = 'test';
    const s3Config = {
      basePath,
      include: 123,
    };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });

    await expect(
      testHelpers.runWebpackConfig({ config })
    ).rejects.toBeInstanceOf(TypeError);
  });

  test('progress', async () => {
    const basePath = 'test';
    const s3Config = { basePath, progress: true };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });
    const compilation = await testHelpers.runWebpackConfig({ config });
    const assets = compilation.stats.toJson().assets;

    expect(assets.length).toBe(3);
    expect((ProgressBar as any).mock.instances).toHaveLength(1);
    // 3 files X 3 progress updates
    expect(ProgressBar.prototype.update).toHaveBeenCalledTimes(9);
  });
});

describe('CloudFront invalidation', () => {
  beforeEach(() => {
    testHelpers.mockS3Client();
  });

  test('should invalidate the Cloudfront distribution', async () => {
    const basePath = 'test';
    const s3Config = {
      basePath,
      include: filename => filename.includes(testHelpers.OUTPUT_FILE_NAME),
      cloudfrontInvalidateOptions: s3_options.cloudfrontInvalidateOptions,
    };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });

    (awsSdk.CloudFront as any).mockImplementation(() => ({
      createInvalidation: (params, callback) => {
        callback(
          /* error */ null,
          /* response */ { Invalidation: { Id: 'abc123' } }
        );
      },
    }));

    await testHelpers.runWebpackConfig({ config });

    expect(awsSdk.CloudFront).toHaveBeenCalled();
  });

  test('should throw an error when it fails', async () => {
    const basePath = 'test';
    const s3Config = {
      basePath,
      include: filename => filename.includes(testHelpers.OUTPUT_FILE_NAME),
      cloudfrontInvalidateOptions: s3_options.cloudfrontInvalidateOptions,
    };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });

    (awsSdk.CloudFront as any).mockImplementation(() => ({
      createInvalidation: (params, callback) => {
        callback(/* error */ new Error('Connection failed'));
      },
    }));

    await expect(
      testHelpers.runWebpackConfig({ config })
    ).rejects.toBeInstanceOf(Error);
  });

  test('should throw an error when response is empty', async () => {
    const basePath = 'test';
    const s3Config = {
      basePath,
      include: filename => filename.includes(testHelpers.OUTPUT_FILE_NAME),
      cloudfrontInvalidateOptions: s3_options.cloudfrontInvalidateOptions,
    };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });

    (awsSdk.CloudFront as any).mockImplementation(() => ({
      createInvalidation: (params, callback) => {
        callback(/* error */ null, /* response */ { Invalidation: null });
      },
    }));

    await expect(
      testHelpers.runWebpackConfig({ config })
    ).rejects.toBeInstanceOf(Error);
  });
});

describe('Upload issues', () => {
  test('connection failed', async () => {
    expect.assertions(2);
    testHelpers.mockS3Client({ withError: new Error('Connection failed') });

    const basePath = 'test';
    const s3Config = { basePath };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });

    try {
      await testHelpers.runWebpackConfig({ config });
    } catch (err) {
      expect(err.message).toContain(`${PLUGIN_NAME}: failed to upload file`);
      expect(err.message).toContain('Connection failed');
    }
  });
});
