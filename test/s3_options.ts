const {
  AWS_BUCKET = 'test-bucket',
  AWS_REGION = 'mars',
  AWS_ACCESS_KEY = 'my-access-key',
  AWS_SECRET_ACCESS_KEY = 'my-secret-access-key',
  CLOUDFRONT_DISTRIBUTION_ID = 'my-cloudfront-distribution',
} = process.env;

export default {
  AWS_BUCKET,
  AWS_REGION,
  AWS_ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY,
  CLOUDFRONT_DISTRIBUTION_ID,

  s3Options: {
    accessKeyId: AWS_ACCESS_KEY,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    region: AWS_REGION,
  },

  s3UploadOptions: {
    Bucket: AWS_BUCKET,
  },

  cloudfrontInvalidateOptions: {
    DistributionId: CLOUDFRONT_DISTRIBUTION_ID,
    Items: ['/*'],
  },
};
