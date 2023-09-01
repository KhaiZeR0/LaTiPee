const express = require('express');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const sql = require('mssql');
const session = require('express-session');

const app = express();

const dbConfig = {
  driver: "mssql",
  server: "localhost",
  database: "LaTiPee",
  user: "Talent/0392956804",
  password: "your_password",
  port: 1433,
  trustServerCertificate: true,
};

// Dùng để lưu pool kết nối
let sqlPool; 

sql.connect(dbConfig).then(pool => {
    console.log("Connected to SQL Server");
    sqlPool = pool;
}).catch(err => console.error('SQL Connection Error:', err));


app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'ejs');

//session middleware
app.use(session({
  secret: 'abc123',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false, // Set to true in a production environment with HTTPS
    maxAge: 3600000, // Set the session to expire after a certain time (1 hour in this case)
  },
}));

const JWT_SECRET = 'some super secret...';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: 'khai.sendmail@gmail.com',
      pass: 'bfsjnqexelavxnhi',
    },
  });

  const authenticateAdmin = (req, res, next) => {
    console.log("Session user:", req.session.user); // Debugging
    if (req.session && req.session.user && req.session.user.admin === 'y') {
      return next();
    } else {
      console.log("Admin authentication failed"); // Debugging
      res.redirect('/login/admin');
    }
  };

app.get('/', async (req, res) => {
  try {
    const userSession = req.session.user;
  
    // Fetch product data from JSON server or your database
    const response = await axios.get('http://localhost:8000/Products?_start=0&_limit=8');
    let products = response.data;

    res.render('index', { products: products, user: userSession });
  } catch (error) {
    console.error("Error loading products:", error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/product/:productId', async (req, res, next) => {
  const productId = req.params.productId;
  
  try {
      // Lấy dữ liệu sản phẩm từ API hoặc cơ sở dữ liệu của bạn
      const response = await axios.get(`http://localhost:8000/Products/${productId}`);
      const product = response.data;

      if (!product) {
          return res.status(404).send('Sản phẩm không tồn tại');
      }
  
      // Render trang EJS với dữ liệu sản phẩm
      res.render('product-detail', { product: product });
  } catch (error) {
      console.error("Error fetching product details:", error);
      res.status(500).send('Lỗi máy chủ');
  }
});

app.get('/logout', (req, res) => {
  req.session.user = null; // Clear user data from the session
  res.redirect('/'); // Redirect to home page or another page
});


app.get('/login/admin', (req, res, next) => {
  res.render('Admin-login');
});
app.get('/seller', async (req, res, next) => {
  try {
    const userSession = req.session.user;

    if (!userSession) {
      // Redirect to login page or handle unauthorized access
      return res.redirect('/login');
    }

    // Fetch product data from JSON server or your database
    const productResponse = await axios.get('http://localhost:8000/Products');
    const products = productResponse.data.filter(product => product.ShopID === userSession.userId);

    // Fetch order data from JSON server or your database
    const orderResponse = await axios.get('http://localhost:8000/Orders');
    const orders = orderResponse.data.filter(order => order.ShopID === userSession.userId);

    // Render the seller homepage with product and order data
    res.render('seller-homepage', { products: products, orders: orders, user: userSession });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).send('Internal Server Error');
  }
});



app.get('/forgot', (req, res, next) => {
  res.render('forgot-password');
});
app.get('/login', (req, res, next) => {
  res.render('login-signup-user');
});
app.get('/dasboard', (req, res, next) => {
  res.render('user-dasboard');
});

app.get('/admin', authenticateAdmin, async (req, res, next) => {
  try {
    // Fetch user data from JSON server or your database
    const userResponse = await axios.get('http://localhost:8000/users');
    const users = userResponse.data;

    // Fetch product data from JSON server or your database
    const productResponse = await axios.get('http://localhost:8000/Products');
    const products = productResponse.data;

    // Render admin.ejs with user and product data
    res.render('admin', { users: users, products: products });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).send('Internal Server Error');
  }
});


app.post('/loadMoreProducts', async (req, res) => {
  try {
    const { offset } = req.body;
    const response = await axios.get(`http://localhost:8000/Products?_start=${offset}&_limit=8`);
    res.json(response.data);
  } catch (error) {
    console.error("Error loading more products:", error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/search', async (req, res) => {
  try {
      const keyword = req.body.keyword;
      const response = await axios.get(`http://localhost:8000/Products`);
      const products = response.data.filter(product => 
          product.name.toLowerCase().includes(keyword.toLowerCase())
      );
      res.json(products);
  } catch (error) {
      console.error("Error during search:", error);
      res.status(500).send('Internal Server Error');
  }
});

//login (admin)
app.post('/login/admin', async (req, res, next) => {
  const { userName, password } = req.body;

  try {
    const response = await axios.get(`http://localhost:8000/users?userName=${userName}`);
    const admin = response.data.find(user => user.userName === userName && user.admin === 'y');

    if (!admin) {
      return res.status(400).send('Tên đăng nhập không tồn tại hoặc không phải là admin');
    }
    if (admin.status === '0') {
      return res.status(403).send('Tài khoản của bạn đã bị cấm');
    }

    const checkPass = await bcrypt.compare(password, admin.password);

    if (!checkPass) {
      return res.status(400).send('Mật khẩu không chính xác');
    }

    // Set user data in the session
    req.session.user = admin;

    // Redirect to admin dashboard
    res.redirect('/admin');

  } catch (error) {
    console.log(error);
    res.status(500).send('Có lỗi xảy ra');
  }
});

// admin (function)
app.post('/admin/update-user-status', async (req, res, next) => {
  const { userId, newStatus, newType } = req.body;

  try {
      const response = await axios.get(`http://localhost:8000/users?id=${userId}`);
      const user = response.data[0];

      if (!user) {
          return res.status(404).send('User not found');
      }
      const updateUserResponse = await axios.patch(`http://localhost:8000/users/${userId}`, {
          status: newStatus,
      });

      if (updateUserResponse.status === 200) {
          res.status(200).send('User account updated successfully');
      } else {
          throw new Error('Failed to update user account');
      }
  } catch (error) {
      console.error("Error updating user account:", error);
      res.status(500).send('Internal Server Error');
  }
});
app.post('/admin/update-product-status', async (req, res, next) => {
  const { productId, newStatus } = req.body;

  try {
      const updateProductResponse = await axios.patch(`http://localhost:8000/Products/${productId}`, {
          status: newStatus,
      });

      if (updateProductResponse.status === 200) {
          res.status(200).send('Product status updated successfully');
      } else {
          throw new Error('Failed to update product status');
      }
  } catch (error) {
      console.error("Error updating product status:", error);
      res.status(500).send('Internal Server Error');
  }
});


//đăng nhập
app.post('/login', async (req, res, next) => {
  const { userName, password } = req.body;

  try {
    const response = await axios.get(`http://localhost:8000/users?userName=${userName}`);
    const user = response.data[0];

    if (!user) {
      return res.status(400).send('Tên đăng nhập không tồn tại');
    }
    if (user.status === '0') {
      return res.status(403).send('Tài khoản của bạn đã bị cấm');
    }

    const checkPass = await bcrypt.compare(password, user.password);

    if (!checkPass) {
      return res.status(400).send('Mật khẩu không chính xác');
    }

    // Store both username and userID in the session
    req.session.user = {
      userName: user.userName,
      userId: user.id,
    };

    res.redirect('/');
    // ...
  } catch (error) {
    console.log(error);
    res.status(500).send('Có lỗi xảy ra');
  }
});


// Đăng ký
app.post('/signup', async (req, res, next) => {
  const { userName, email, password } = req.body;

  try {
      const userCheck = await axios.get(`http://localhost:8000/users?userName=${userName}`);
      if (userCheck.data.length > 0) {
          return res.status(400).send('Tên đăng nhập đã tồn tại');
      }

      const emailCheck = await axios.get(`http://localhost:8000/users?email=${email}`);
      if (emailCheck.data.length > 0) {
          return res.status(400).send('Email đã tồn tại');
      }

      const saltRounds = 10; 
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const newUser = {
          userName,
          email, 
          password: hashedPassword  
      };

      const createUserResponse = await axios.post(`http://localhost:8000/users`, newUser); 
      if (createUserResponse.status === 201) {
          res.status(201).send('Đăng kí thành công');
      } else {
          throw new Error('Không thể tạo người dùng mới');
      }
  } catch (error) {
      console.log(error);
      res.status(500).send('Có lỗi xảy ra khi đăng ký');
  }
});

app.post('/forgot', async (req, res, next) => {
  const { email } = req.body;

    try {
      const response = await axios.get(`http://localhost:8000/users?email=${email}`);
      const user = response.data[0];
  // Make sure user exist in database
  if (!user) {
    res.send('Email không tồn tại trong hệ thống, vui lòng nhập lại hoặc đăng kí tài khoản');
    return;
  }

  // User exist and now create a One time link valid for 15minutes
  const secret = JWT_SECRET + user.password;
  const payload = {
    email: user.email,
    id: user.id,
  };
  const token = jwt.sign(payload, secret, { expiresIn: '15m' });
  const link = `http://localhost:3000/reset-password/${user.id}/${token}`;

  const mailOptions = {
    from: 'khai.sendmail@gmail.com',
    to: user.email,
    subject: 'Password Reset Link',
    text: `Here is your password reset link: ${link}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
      res.send('Error sending email.');
    } else {
      console.log('Email sent: ' + info.response);
      res.render('email-sent-success');
    }
  });

} catch (error) {
  console.log(error);
  res.send('Error occurred.');
}
});

app.get('/reset-password/:id/:token', async (req, res, next) => {
  const { id, token } = req.params;

  try {
    const response = await axios.get(`http://localhost:8000/users?id=${id}`);
    const user = response.data[0];

    if (!user) {
      res.send('ID không hợp lệ');
      return;
    }

    const secret = JWT_SECRET + user.password;
    const payload = jwt.verify(token, secret);
    res.render('reset-password', { email: user.email });
  } catch (error) {
    console.log(error.message);
    res.send(error.message);
  }
});

app.post('/reset-password/:id/:token', async (req, res, next) => {
  const { id, token } = req.params;
  const { password, password2 } = req.body;
  try {
    const response = await axios.get(`http://localhost:8000/users?id=${id}`);
    const user = response.data[0];

    if (!user) {
      res.send('ID không hợp lệ');
      return;
    }

    const secret = JWT_SECRET + user.password;
    const payload = jwt.verify(token, secret);

    if (password !== password2) {
      res.send('Mật khẩu không khớp, vui lòng back lại trang trước');
      return;
    }

    // Mã hoá mật khẩu mới
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Cập nhật mật khẩu mới trong JSON Server
    await axios.patch(`http://localhost:8000/users/${id}`, { password: hashedPassword });

    res.send('mật khẩu đã được cập nhật thành công, vui lòng đăng nhập lại');
  } catch (error) {
    console.log(error.message);
    res.send(error.message);
  }
});

//seller
app.post('/dasboard/update-product-status-user', async (req, res, next) => {
  const { productId, newStatus } = req.body;

  try {
      // Fetch the product from the Products array based on the productId
      const productResponse = await axios.get(`http://localhost:8000/Products/${productId}`);
      const product = productResponse.data;

      if (!product) {
          return res.status(404).send('Product not found');
      }

      // Update product's statusUser in JSON Server or your database
      const updateProductResponse = await axios.patch(`http://localhost:8000/Products/${productId}`, {
          statusUser: newStatus, // Update the statusUser field
      });

      if (updateProductResponse.status === 200) {
          res.status(200).send('Product status updated successfully');
      } else {
          throw new Error('Failed to update product status');
      }
  } catch (error) {
      console.error("Error updating product status:", error);
      res.status(500).send('Internal Server Error');
  }
});

//cart
app.get('/cart', async (req, res) => {
  try {
    const userSession = req.session.user;

    if (!userSession) {
      // Redirect to login page if user is not logged in
      return res.redirect('/login');
    }

    // Fetch order data from JSON server or your database
    const orderResponse = await axios.get('http://localhost:8000/Orders');
    const orders = orderResponse.data.filter(order => order.userID === userSession.userId);

    res.render('cart', { orders: orders, user: userSession });
  } catch (error) {
    console.error("Error loading cart:", error);
    res.status(500).send('Internal Server Error');
  }
});





app.listen(3000, () => console.log('🚀 @ http://localhost:3000'));