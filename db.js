require('dotenv').config(); // Load environment variables from .env

const mongoose = require('mongoose');

// Retrieve MongoDB URI from environment variables
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Courses';

// Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected to Courses database'))
.catch(err => console.error('MongoDB connection error:', err));

// Define Schemas
const courseSchema = new mongoose.Schema({
    course_number: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    prerequisites: {
        type: [String],
        default: []
    },
    type: {
        type: [String],
        default: []
    },
});

// Define Models
const Major = mongoose.model('Major', courseSchema);
const Minor1 = mongoose.model('Minor1', courseSchema);
const Minor2 = mongoose.model('Minor2', courseSchema);
const Religion = mongoose.model('Religion', courseSchema);
const Core = mongoose.model('Core', courseSchema);
const Holokai = mongoose.model('Holokai', courseSchema);
const EILLevel1 = mongoose.model('EILLevel1', courseSchema);
const EILLevel2 = mongoose.model('EILLevel2', courseSchema);

// Export Models
module.exports = {
    Major,
    Minor1,
    Minor2,
    Religion,
    Core,
    Holokai,
    EILLevel1,
    EILLevel2,
};