import { EventEmitter } from 'events';

const s3Client: any = jest.genMockFromModule('s3-client');

// @ts-ignore
s3Client.__uploadedFiles = [];

class FakeClient {
  uploadFile({ localFile, s3Params }) {
    const uploader: any = new EventEmitter();

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
    }, 1);

    setTimeout(() => {
      uploader.progressAmount = 27;
      uploader.progressTotal = 100;
      uploader.emit('progress');
    }, 2);

    setTimeout(() => {
      uploader.emit('end');
      s3Client.__uploadedFiles.push({
        localFile,
        s3Path: s3Params.Bucket + '/' + s3Params.Key,
      });
    }, 3);

    return uploader;
  }
}

s3Client.createClient = function() {
  return new FakeClient();
};

export default s3Client;
