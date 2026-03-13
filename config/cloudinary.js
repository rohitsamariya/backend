const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folder = 'hrms/documents';
    if (file.fieldname === 'profileImage' || file.fieldname === 'profilePhoto') {
      folder = 'hrms/profile-images';
    }
    
    return {
      folder: folder,
      allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
      public_id: file.fieldname + '-' + Date.now()
    };
  },
});

module.exports = { cloudinary, storage };
