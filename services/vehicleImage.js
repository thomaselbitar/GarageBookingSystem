const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = path.resolve(__dirname, '../public/uploads/vehicles');
const MAX_BYTES = 5 * 1024 * 1024;
const FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

const MESSAGES = {
    required: 'Add a vehicle image.',
    type: 'Use a JPG, PNG, or WEBP image.',
    size: 'Image must be 5 MB or smaller.',
    save: 'Could not save the vehicle image.'
};

const EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
};

const typeError = () => {
    const error = new Error(MESSAGES.type);
    error.code = 'UNSUPPORTED_IMAGE';
    return error;
};

const storedFilename = (storedPath) => {
    if (typeof storedPath !== 'string') {
        return null;
    }

    const filename = path.basename(storedPath.replace(/\\/g, '/'));
    if (!FILENAME_PATTERN.test(filename)) {
        return null;
    }

    return filename;
};

const isStoredImagePath = (storedPath) => {
    const filename = storedFilename(storedPath);
    return filename ? `/uploads/vehicles/${filename}` === storedPath : false;
};

const isInsideUploadDir = (filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
        return false;
    }

    const relative = path.relative(UPLOAD_DIR, path.resolve(filePath));
    return relative === path.basename(relative)
        && relative !== '..'
        && !relative.startsWith('..' + path.sep)
        && !path.isAbsolute(relative);
};

const detectType = (buffer) => {
    if (!buffer || buffer.length < 12) {
        return null;
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }

    if (
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
        && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    ) {
        return 'image/png';
    }

    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'image/webp';
    }

    return null;
};

const discardUpload = async (file) => {
    if (!file || !isInsideUploadDir(file.path) || !FILENAME_PATTERN.test(path.basename(file.path))) {
        return;
    }

    try {
        await fs.unlink(path.resolve(file.path));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Could not remove a vehicle image.');
        }
    }
};

const removeStoredImage = async (storedPath) => {
    const filename = storedFilename(storedPath);
    if (!filename) {
        return;
    }

    try {
        await fs.unlink(path.join(UPLOAD_DIR, filename));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Could not remove a vehicle image.');
        }
    }
};

const inspectUpload = async (file) => {
    if (!file) {
        return { ok: false, message: MESSAGES.required };
    }

    if (!isInsideUploadDir(file.path) || !FILENAME_PATTERN.test(file.filename || '')) {
        return { ok: false, message: MESSAGES.type };
    }

    let handle;

    try {
        handle = await fs.open(file.path, 'r');
        const stat = await handle.stat();

        if (stat.size > MAX_BYTES) {
            return { ok: false, message: MESSAGES.size };
        }

        if (stat.size < 12) {
            return { ok: false, message: MESSAGES.type };
        }

        const buffer = Buffer.alloc(12);
        await handle.read(buffer, 0, 12, 0);
        const detected = detectType(buffer);

        if (!detected || detected !== file.mimetype) {
            return { ok: false, message: MESSAGES.type };
        }

        return {
            ok: true,
            publicPath: `/uploads/vehicles/${file.filename}`
        };
    } catch (error) {
        return { ok: false, message: MESSAGES.type };
    } finally {
        if (handle) {
            await handle.close();
        }
    }
};

const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, callback) => {
        const extension = EXTENSIONS[file.mimetype];
        if (!extension) {
            callback(typeError());
            return;
        }

        callback(null, `${crypto.randomUUID()}${extension}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_BYTES,
        files: 1,
        fields: 8,
        fieldSize: 1024
    },
    fileFilter: (req, file, callback) => {
        if (!EXTENSIONS[file.mimetype]) {
            callback(typeError());
            return;
        }

        callback(null, true);
    }
});

const receiveVehicleImage = (req, res, next) => {
    upload.single('image')(req, res, (error) => {
        if (!error) {
            return next();
        }

        let message = MESSAGES.save;
        if (error.code === 'LIMIT_FILE_SIZE') {
            message = MESSAGES.size;
        } else if (error.code === 'UNSUPPORTED_IMAGE' || error.code === 'LIMIT_UNEXPECTED_FILE') {
            message = MESSAGES.type;
        }

        console.error('Vehicle image upload failed:', error.code || error.name);
        req.session.vehicleError = message;

        return req.session.save((saveError) => {
            if (saveError) {
                console.error('Could not save the vehicle message.');
                return res.status(500).send('Could not save the form message.');
            }

            const vehicleId = req.params && req.params.id;
            const destination = typeof vehicleId === 'string' && /^[1-9]\d*$/.test(vehicleId)
                ? `/customer/vehicles/${vehicleId}`
                : '/customer/vehicles';
            return res.redirect(303, destination);
        });
    });
};

module.exports = {
    MESSAGES,
    isStoredImagePath,
    inspectUpload,
    discardUpload,
    removeStoredImage,
    receiveVehicleImage
};
