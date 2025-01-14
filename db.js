require('dotenv').config(); // Load environment variables from .env

const mongoose = require('mongoose');

// Retrieve MongoDB URI from environment variables
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/Courses';

// Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected to Courses database'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Define Course Schema
// ...existing code...
const courseSchema = new mongoose.Schema({
    category: { // e.g., "Majors", "Minors", etc.
        type: String,
        required: true,
        enum: ["Majors", "Minors", "Core", "EIL", "Religion", "Holokai"]
    },
    type: { // e.g., "Accounting Major", "Accounting Minor", etc.
        type: String,
        required: true
    },
    course_number: {
        type: String,
        required: true,
        unique: true, // Ensures no duplicate course numbers
        trim: true
    },
    course_name: {
        type: String,
        required: true,
        trim: true
    },
    semesters_offered: {
        type: [String],
        enum: ["Fall", "Winter", "Spring"],
        default: []
    },
    credits: {
        type: Number,
        required: true,
        min: [0, 'Credits cannot be negative']
    },
    prerequisites: {
        type: [String],
        default: [],
        validate: {
            validator: function(v) {
                return Array.isArray(v);
            },
            message: props => `${props.value} is not a valid prerequisites list!`
        }
    },
    program: { // New field to associate courses with programs
        type: String,
        required: true
    }
}, {
    timestamps: true // Adds createdAt and updatedAt timestamps
});

// Create and Export the Course Model
const Course = mongoose.model('Course', courseSchema);

module.exports = {
    Course,
};
