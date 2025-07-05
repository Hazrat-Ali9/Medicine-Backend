const express = require('express')
const cors = require('cors')
require('dotenv').config()
const app = express()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.SECREAT_API_KEY);
const port = 5000

// Use the CORS middleware properly
app.use(cors());
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.s0vwyit.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    // await client.connect();

    const productsCollection = client.db('medicine-server').collection('products');
    const categoryCollection = client.db('medicine-server').collection('category');
    const cartCollection = client.db('medicine-server').collection('carts');
    const usersCollection = client.db('medicine-server').collection('users');
    const paymentsCollection = client.db('medicine-server').collection('payments');

    // middleWare
    const verifyToken = (req, res, next) => {
      console.log('inside verifyToken', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'forbidden access' });
      }
      const token = req.headers.authorization.split(' ')[1]; // স্পেস দিয়ে স্প্লিট
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'forbidden access' });
        }
        req.decoded = decoded;
        next(); // সঠিকভাবে এখানেই next() কল হয়েছে
      });
    };

    // varifyAdmin
    const varifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      console.log(email)
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };

    const verifySeller = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isSeller = user?.role === 'seller';
      if (!isSeller) {
        return res.status(403).send({ message: 'forbidden access' }); // এখানে `status` ঠিক করা হয়েছে
      }
      next();
    };



    // jwt related api 
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      })
      res.send({ token })
    })


    // seller 
    app.patch('/users/:id', async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });




    app.get('/users/seller/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);

      // সরাসরি চেক করা হলো
      const seller = user?.role === 'seller';

      res.send({ seller });
    });



    // users related api
    app.post('/users', async (req, res) => {
      const userItem = req.body;
      // insert email if user dose'nt  exist
      const query = { email: userItem.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ massage: 'user already exist', insertId: null })
      }
      const result = await usersCollection.insertOne(userItem);
      res.send(result)
    })
    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result)
    })

    // app.get('/users/:email', verifyToken, async (req, res)=>{
    //   const query = {email : req.params.email}
    //   const result = await usersCollection.find(query).toArray();
    //   res.send(result)
    // })
    app.get('/users/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      const result = await usersCollection.find(query).toArray()
      res.send(result);
    });


    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    });


    // addmin role
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result)
    })
    // normal user
    app.patch('/users/user/:id', async (req, res) => {
      const { id } = req.params;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: 'user' } } // নতুন রোল সেট করুন
      );
      res.send(result);
    });

    // get all seller
    app.get('/users/sellers', async (req, res) => {
      const sellers = await usersCollection.find({ role: 'seller' }).toArray();
      res.send(sellers);
    });


    app.delete('/users/:id', verifyToken, varifyAdmin, async (req, res) => {
      const id = req.params.id;
      const qurey = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(qurey)
      res.send(result)
    })




    // products related api
    app.post('/products', verifyToken, async (req, res) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email: email });

      // Check if the user is either a seller or an admin
      if (user?.role !== 'seller' && user?.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      const productItem = req.body;
      const result = await productsCollection.insertOne(productItem);
      res.send(result);
    });


    app.get('/products', async (req, res) => {
      const result = await productsCollection.find().toArray();
      res.send(result);
    });

    app.get('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result)
    })

    app.patch('/products/:id', async (req, res) => {
      const product = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          name: product.name,
          category: product.category,
          price: product.price,
          image: product.image,
          des: product.des
        }
      }
      const result = await productsCollection.updateOne(filter, updateDoc);
      res.send(result)
    })

    app.get('/products/:email', async (req, res) => {
      const email = req.params.email; // URL থেকে email নেওয়া

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      const result = await productsCollection.find({ email: email }).toArray();
      res.send(result);
    });

    app.delete('/products/:id', async (req, res) => {
      const id = req.params.id;
      const qurey = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(qurey)
      res.send(result)
    })



    app.get('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result)
    })
    // category releted api
    app.get('/category', async (req, res) => {
      const result = await categoryCollection.find().toArray();
      res.send(result)
    })
    // cart releted api
    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result)
    });

    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email }
      const result = await cartCollection.find(query).toArray();
      res.send(result)
    })
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const qurey = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(qurey)
      res.send(result)
    })

    // payments
    app.post('/create-checkout-session', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log(amount);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card'] // এখানে টাইপো ঠিক করা হয়েছে
        });

        res.send({
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        console.error('Payment Intent Error:', error);
        res.status(500).send({ error: error.message });
      }
    });

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      console.log(payment);

      const query = {
        _id: {
          $in: Array.isArray(payment.cardId)
            ? payment.cardId.map(id => new ObjectId(id.toString()))
            : []
        }
      };

      const deleteResult = await cartCollection.deleteMany(query);
      res.send({ result, deleteResult });
    });

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email }
      const result = await paymentsCollection.find(query).toArray();
      res.send(result)
    })

    app.get('/payments', verifyToken, verifySeller, async (req, res) => {
      try {
        // Extract email from req.user after token verification
        const email = req.query.email

        // Filter payments based on the seller's email
        const result = await paymentsCollection.find({ sellerEmail: email }).toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch payments', error });
      }
    });

    app.get('/admin-stats', verifyToken, varifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const products = await productsCollection.estimatedDocumentCount();
      const orders = await cartCollection.estimatedDocumentCount();

      const payments = await paymentsCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$price' }
          }
        }
      ]).toArray();

      const revenue = payments.length > 0 ? payments[0].totalRevenue : 0

      res.send({ users, products, orders, revenue })
    })

    
  


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
