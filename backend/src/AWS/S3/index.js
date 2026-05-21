import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { AWS_BUCKET_NAME, AWS_PRIVATE_KEY, AWS_PUBLIC_KEY, AWS_REGION } from '../../../config.js';

// En ECS Fargate las credenciales vienen del IAM Task Role automáticamente.
// En local, el SDK usa el perfil de ~/.aws/credentials.
const clients = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_PUBLIC_KEY,
    secretAccessKey: AWS_PRIVATE_KEY,
  },
});

const extensionsInline = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'application/pdf',
];

export async function uploadFileS3(folder, NameFile, file) {
  try {
    if (!file || !file.data) {
      throw new Error('File data is missing');
    }

    const uploadParams = {
      Bucket: AWS_BUCKET_NAME,
      Key: `${folder}${NameFile}`,
      Body: file.data,
      ContentType: file.mimetype,
    };

    if (extensionsInline.includes(file.mimetype)) {
      uploadParams.ContentDisposition = 'inline';
    }

    const command = new PutObjectCommand(uploadParams);

    await clients.send(command);

    return { success: true };
  } catch (error) {
    console.error('Error uploading to S3:', { message: error.message, stack: error.stack });
    return { success: false, error: error.message };
  }
}

export async function listFilesS3(prefix = '') {
  try {
    const command = new ListObjectsV2Command({
      Bucket: AWS_BUCKET_NAME,
      Prefix: prefix,
    });

    const data = await clients.send(command);

    return { success: true, files: data.Contents ?? [] };
  } catch (error) {
    console.error('Error listing S3 files:', { message: error });
    return { success: false, error: error.message };
  }
}

export async function deleteFileS3(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: AWS_BUCKET_NAME,
      Key: key,
    });

    await clients.send(command);

    return { success: true };
  } catch (error) {
    console.error('Error deleting S3 file:', { message: error.message });
    return { success: false, error: error.message };
  }
}
