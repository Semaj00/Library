const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const port = process.env.PORT || 3030;

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/Library_system', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

// Define User schema and model
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String
});
const User = mongoose.model('User', userSchema);

// Define Book schema and model
const bookSchema = new mongoose.Schema({
    title: String,
    author: String,
    isbn: String,
    published_date: Date,
    genre: String,
    language: String,
    shelf_location: String,
    status: String,
    quantity: { type: Number, default: 1 } // Add quantity field with default value 1
});
const Book = mongoose.model('Book', bookSchema);

// Define LendingHistory schema and model
const lendingHistorySchema = new mongoose.Schema({
    borrower_name: String,
    borrower_contact: String,
    book_title: String, // Change borrowed_book to book_title
    year_level: String,
    program_course: String,
    date_borrowed: { type: Date, default: Date.now },
    date_returned: Date,
    status: { type: String, default: 'Unavailable' }
});
const LendingHistory = mongoose.model('LendingHistory', lendingHistorySchema);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Add this line to parse JSON data

// Serve static files
app.use(express.static(path.join(__dirname, 'src', 'styles')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'styles', 'login.html'));
});

app.post('/register', async (req, res) => {
  const { username, email, password, confirm_password } = req.body;
  if (password !== confirm_password) {
    return res.status(400).send('Passwords do not match');
  }
  const user = new User({ username, email, password });
  await user.save();
  res.redirect('/');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, password });
  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid credentials' });
  }
  console.log(`User ${username} logged in successfully`);
  res.json({ success: true });
});

app.post('/add-book', async (req, res) => {
    console.log('Received book data:', req.body); // Log the received data

    // Check if all required fields are provided
    const { title, author, isbn, published_date, genre, language, shelf_location, status, quantity } = req.body;
    if (!title || !author || !isbn || !published_date || !genre || !language || !shelf_location || !status || quantity === undefined) {
        console.error('Missing required fields');
        return res.status(400).send('Missing required fields');
    }

    // Parse the published_date from dd/mm/yyyy format
    const [day, month, year] = published_date.split('/');
    const publishedDate = new Date(year, month - 1, day);

    // Ensure the data types are correct
    const bookData = {
        title,
        author,
        isbn,
        published_date: publishedDate,
        genre,
        language,
        shelf_location,
        status,
        quantity: parseInt(quantity, 10) // Ensure quantity is an integer
    };

    console.log('Parsed book data:', bookData); // Log the parsed data

    // Create a new book instance with the parsed data
    const book = new Book(bookData);

    console.log('Book instance:', book); // Log the book instance

    try {
        await book.save();
        console.log('Book saved successfully');
        res.status(201).json(book); // Return the saved book data
    } catch (error) {
        console.error('Error adding book:', error);
        res.status(500).send('Failed to add book');
    }
});

app.post('/borrow-book', async (req, res) => {
    console.log('Received borrow data:', req.body); // Log the received data
    const { borrower_name, book_title, date_borrowed } = req.body;

    // Check if all required fields are provided
    if (!borrower_name || !book_title || !date_borrowed) {
        console.error('Missing required fields: borrower_name, book_title, or date_borrowed');
        return res.status(400).send('Missing required fields: borrower_name, book_title, or date_borrowed');
    }

    // Find the book and check its status
    try {
        console.log(`Searching for book with title: ${book_title}`); // Log the book title being searched
        const book = await Book.findOne({ title: book_title });
        if (!book) {
            console.error('Book not found:', book_title);
            return res.status(404).send('Book not found');
        }
        console.log('Book found:', book); // Log the found book

        if (book.status !== 'Available') {
            console.error('Book is currently unavailable for borrowing:', book_title);
            return res.status(400).send('Book is currently unavailable for borrowing');
        }

        if (book.quantity <= 0) {
            console.error('No copies available for borrowing:', book_title);
            return res.status(400).send('No copies available for borrowing');
        }

        // Update the book's quantity
        book.quantity -= 1;
        await book.save();
        console.log('Book status updated to Unavailable:', book);

        // Ensure date_borrowed is set to the current date if not provided
        const borrowedDate = date_borrowed || new Date().toISOString().split('T')[0];

        const lendingEntry = new LendingHistory({
            borrower_name,
            book_title, // Use book_title instead of borrowed_book
            date_borrowed: borrowedDate,
            status: 'Unavailable'
        });
        await lendingEntry.save();
        console.log('Lending entry saved successfully:', lendingEntry); // Log the saved entry
        res.status(201).json(lendingEntry);
    } catch (error) {
        console.error('Error borrowing book:', error);
        res.status(500).send('Failed to borrow book');
    }
});

app.post('/return-book', async (req, res) => {
    const { book_title, date_returned } = req.body;

    try {
        // Find the book and update its status to "Available"
        const book = await Book.findOne({ title: book_title });
        if (!book) {
            return res.status(404).send('Book not found');
        }
        book.status = 'Available';
        book.quantity += 1; // Increment the quantity when the book is returned
        await book.save();

        // Update the lending history entry with the return date
        const lendingEntry = await LendingHistory.findOne({ book_title, status: 'Unavailable' });
        if (!lendingEntry) {
            return res.status(404).send('Lending entry not found');
        }
        lendingEntry.date_returned = new Date(date_returned);
        lendingEntry.status = 'Available';
        await lendingEntry.save();

        res.status(200).send('Book returned successfully');
    } catch (error) {
        console.error('Error returning book:', error);
        res.status(500).send('Failed to return book');
    }
});

app.get('/books', async (req, res) => {
    try {
        const query = req.query.title ? { title: req.query.title } : {};
        console.log('Fetching books with query:', query); // Log the query
        const books = await Book.find(query);
        console.log('Books fetched:', books); // Log the fetched books
        res.json(books);
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).send('Failed to fetch books');
    }
});

app.get('/lending-history', async (req, res) => {
    try {
        const history = await LendingHistory.find({}, 'borrower_name book_title date_borrowed date_returned status'); // Include date_returned field
        res.json(history);
    } catch (error) {
        console.error('Error fetching lending history:', error);
        res.status(500).send('Failed to fetch lending history');
    }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});