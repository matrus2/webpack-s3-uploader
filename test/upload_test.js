/* eslint-env mocha */
const S3Opts = require('./s3_options');
const testHelpers = require('./upload_test_helpers');
const sinon = require('sinon');

const assertFileMatches = testHelpers.assertFileMatches.bind(testHelpers);
const testForFailFromStatsOrGetS3Files = testHelpers.testForFailFromStatsOrGetS3Files.bind(testHelpers); // eslint-disable-line max-len

// Notes:
// I had to use a resolve for the error instead of reject
// because it would fire if an assertion failed in a .then
describe('S3 Webpack Upload', () => {
  beforeEach(testHelpers.cleanOutputDirectory);

  describe('With directory', () => {
    let s3Config;
    let config;

    beforeEach(() => {
      config = testHelpers.createWebpackConfig({ s3Config });
      testHelpers.createOutputPath();
    });

    it('uploads entire directory to s3', () => { // eslint-disable-line
      return testHelpers.runWebpackConfig({ config })
        .then(testHelpers.testForFailFromDirectoryOrGetS3Files(testHelpers.OUTPUT_PATH))
        .then(assertFileMatches);
    });

    it('uploads build to s3 with basePath', () => {
      const BASE_PATH = 'test';
      s3Config = { basePath: BASE_PATH };

      config = testHelpers.createWebpackConfig({ s3Config });

      testHelpers.createOutputPath();
      return testHelpers.runWebpackConfig({ config })
        .then(testHelpers.testForFailFromDirectoryOrGetS3Files(testHelpers.OUTPUT_PATH, BASE_PATH))
        .then(assertFileMatches);
    });
  });

  it('starts a CloudFront invalidation', () => {
    const s3Config = {
      cloudfrontInvalidateOptions: testHelpers.getCloudfrontInvalidateOptions(),
    };

    const config = testHelpers.createWebpackConfig({ s3Config });

    testHelpers.createOutputPath();

    return testHelpers.runWebpackConfig({ config })
      .then(testHelpers.testForFailFromDirectoryOrGetS3Files(testHelpers.OUTPUT_PATH))
      .then(assertFileMatches);
  });

  it('allows functions to be used for "s3UploadOptions"', () => {
    const Bucket = sinon.spy(() => S3Opts.AWS_BUCKET);

    const s3Config = {
      s3UploadOptions: { Bucket },
    };

    const config = testHelpers.createWebpackConfig({ s3Config });

    return testHelpers.runWebpackConfig({ config })
      .then(testForFailFromStatsOrGetS3Files)
      .then(() => sinon.assert.called(Bucket));
  });
});
