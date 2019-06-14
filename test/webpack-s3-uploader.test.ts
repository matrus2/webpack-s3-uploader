/* eslint-env mocha */
import _ from 'lodash';
import s3Client from 's3-client';
import ProgressBar from 'progress';
import {
  getFixturePathSync,
  createTempDirSync,
  cleanupTempDirs,
} from 'jest-fixtures';

import testHelpers from './upload_test_helpers';

const OUTPUT_DIR = createTempDirSync();
const ENTRY_PATH = getFixturePathSync(__dirname, 'index.js');

jest.mock('aws-sdk');
jest.mock('progress');
jest.setTimeout(30000);

afterAll(() => {
  return cleanupTempDirs();
});

beforeEach(() => {
  // @ts-ignore
  ProgressBar.mockClear();
  s3Client.__uploadedFiles = [];
});

describe('Failures', () => {
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

describe('With directory', () => {
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

  test('progress', async () => {
    const basePath = 'test';
    const s3Config = { basePath, progress: true };
    const config = testHelpers.createWebpackConfig(ENTRY_PATH, OUTPUT_DIR, {
      s3Config,
    });
    const compilation = await testHelpers.runWebpackConfig({ config });
    const assets = compilation.stats.toJson().assets;

    expect(assets.length).toBe(3);
    // @ts-ignore
    expect(ProgressBar.mock.instances).toHaveLength(1);
    // 3 files X 3 progress updates
    expect(ProgressBar.prototype.update).toHaveBeenCalledTimes(9);
  });
});
