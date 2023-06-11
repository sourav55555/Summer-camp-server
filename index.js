require("dotenv").config();
const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { query } = require('express');
const stripe = require('stripe')(process.env.PAY_SECRET);

const port = process.env.PORT || 5000;


app.use(cors())
app.use(express.json());


const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];


  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (error) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@clustersorav.tqapkj6.mongodb.net/?retryWrites=true&w=majority`;

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();


    const userCollection = client.db("summer-school").collection("users");
    const classCollcetion = client.db("summer-school").collection("classes");
    const paymentCollection = client.db("summer-school").collection("payments");
    const selectedCollection = client.db("summer-school").collection("selectedClasses");

    // jwt token 
    app.post('/jwt', (req, res) => {

      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '3h' })
      res.send({ token });

    })

    // verify andmin 
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email; 
      const query = { email: email }
      const user = await userCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden admin' });
      }
      next();
    }

    //get classes
    app.get("/classes", async (req,res)=>{
      const sort = { students: -1 };
      const result = await classCollcetion.find().sort(sort).toArray();
      res.send(result)
    })

    // get specific classes
    app.get("/myclass/:email", verifyJWT, async (req, res)=>{
      const email = req.params.email;

      if(req.decoded.email !== email){
        return res.send({message: "unauthorized"})
      }

      const query = { instructorEmail: email};
      const result = await classCollcetion.find(query).toArray();
      res.send(result);
    })

    // set class status 
    app.patch("/class/:id", verifyJWT, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const status = req.body.string

      const set = {
        $set: {status: status}
      }
      const query = {_id: new ObjectId(id)}

      const result = await classCollcetion.updateOne(query, set);
      res.send(result);
    })

    // set class feedback 
    app.put("/classfeedback/:id", verifyJWT, verifyAdmin, async(req, res)=>{
      const id1 = req.params.id;

      const feedback = req.body.feedback;

      const set = {
        $set: {"feedback": feedback}
      }
      const query = {_id: new ObjectId(id1)}

      const result = await classCollcetion.updateOne(query, set);
      res.send(result);
    })

    // add a class 
    app.post("/class" , verifyJWT, async(req,res)=>{
      const data = req.body;
      const result = await classCollcetion.insertOne(data.newClass);
      res.send(result);
    })

    //class decrement
    app.patch("/dec-class/:name", async(req, res)=>{
      const classname = req.params.name;
      const query = {name: classname};
      const result = await classCollcetion.updateOne(query, {$inc: {  "availableSets" : -1 , "students" : 1}});
      res.send(result);
    })

    // get all instructors 
    app.get("/instructors", async (req, res)=>{

      const query = { role: "instructor" };
      const result = await userCollection.find(query).toArray();

      res.send(result);

    })
    
    // get all users 
    app.get("/user", async(req, res)=>{

      const result = await userCollection.find().toArray();
      res.send(result);

    })

    //create user
    app.post("/user", async( req, res)=>{
      
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);

    })

    // get user role 
    app.get("/roleuser/:email", verifyJWT, async (req, res) =>{
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ user: false })
      }

      const query = {email: email};

      const getuser = await userCollection.findOne(query);

      if(getuser.role == "admin"){
        return res.send({admin: true})
      }
      else if(getuser.role == "instructor"){
        return res.send({instructor: true})
      }
      else{
        return res.send({student: true})
      }
    })

    // update user role 
    app.patch("/roleuser/:id", verifyJWT, verifyAdmin, async(req, res)=>{
      const id = req.params.id;
      const role = req.body.role;
      const query = {_id: new ObjectId(id)};
      const set = {
        $set: {role: role}
      }
      const result = await userCollection.updateOne(query, set);
      res.send(result);
    })

    //add select class
    app.post('/select', verifyJWT , async(req, res)=>{
      const data = req.body.selectData;
      console.log(data,"selectdata");
      const result = await selectedCollection.insertOne(data);
      res.send(result);
    })

    // get select class 
    app.get("/select/:email", verifyJWT , async(req, res)=>{
      const email = req.params.email;
      const query = {studentemail: email};
      const result = await selectedCollection.find(query).toArray();
      res.send(result);
    })

    // delete select class 
    app.delete("/select", verifyJWT, async(req, res) =>{
      const email = req.query.email;;
      const classname = req.query.classname;

      const query = {
        classname: classname,
        studentemail: email
      }
      const result = await selectedCollection.deleteOne(query);
      res.send(result);
     
    })

    //update select after payment
    app.patch("/select", async (req, res)=>{
       const email = req.query.email;
       const classname = req.query.class;
      const filter = {
        classname: classname,
        studentemail: email
      }

      const status = req.body.status;

      const set = {
        $set: {status: status}
      }

      const result = await selectedCollection.updateOne(filter, set);
      res.send(result);
    })

 

    // payment 
    app.post("/create_payment_intent", verifyJWT, async(req, res)=>{
      const {payment} = req.body;
      console.log(payment, "payment");
      const amount = parseFloat(payment * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: [
          "card"
        ],
      })

      res.send({
        clientSecret:  paymentIntent.client_secret,
      })
    })

    app.post("/payments", verifyJWT, async(req, res)=>{
      const paymentInfo = req.body;
      console.log(req.body, "info payment")
      const result = await paymentCollection.insertOne(paymentInfo);
      res.send(result);
    })

    app.get("/payments/:email",verifyJWT, async(req,res)=>{
      const email = req.params.email;
      const query = {email: email};
      const sort = {date : -1 };
      const result = await paymentCollection.find(query).sort(sort).toArray();
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get("/", (req, res)=>{
    res.send("server online");
})

app.listen(port, ()=>{
    console.log("server online");
})