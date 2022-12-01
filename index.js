const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;

const app = express();
require('dotenv').config();
//middleware
app.use(cors());
app.use(express.json())

//mongoDb altes
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.lhptd0u.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

//JWT verifyToken 
async function verifyJWT(req, res, next) {
    const authHeder = req.headers.authorization;
    if (!authHeder) {
        return res.status(401).send('Unathorizetion access')
    }

    const token = authHeder.split(' ')[1];
    jwt.verify(token, process.env.ACCSS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(402).send({ message: "forbiden access" })
        }

        req.decoded = decoded;
        next()
    })

}

async function run() {

    try {
        const CetegoriesCars = client.db('carPoint').collection('categories');
        const allCarCollection = client.db('carPoint').collection('All-Products');
        const BookingCar = client.db('carPoint').collection('BookingCar');
        const AllUser = client.db('carPoint').collection('All-Users');
        const adverticCollection = client.db('carPoint').collection('All-Advertic');

        // get all cetegories collctions
        app.get('/cetegories', async (req, res) => {
            const query = {};
            const result = await CetegoriesCars.find(query).toArray();
            res.send(result);
        });
        // Product car post
        app.post('/productAdd', async (req, res) => {
            const review = req.body;
            const result = await allCarCollection.insertOne(review);
            res.send(result)
        });
        
        // cetegories/:Id filter
        app.get('/cetegories/:id', async (req, res) => {
            const product = req.params.id;
            const query = { id: product };
            const result = await allCarCollection.find(query).toArray();
            res.send(result);
        });

        

    }
    catch (error) {
        console.log(error.name, error.message, error.stack);
    }

}

run().catch(error => console.log(error))


app.get('/', (req, res) => {
    res.send('Car point is Runings')
})
app.listen(port, () => console.log(`Cars point is Runing is ${port}`))
