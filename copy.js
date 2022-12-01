const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId} = require('mongodb');
const jwt = require('jsonwebtoken');
const { query } = require('express');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRETE_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.lhptd0u.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


const verifyJWT=(req, res, next)=>{
    // console.log("inside jwt", req.headers.authorization);
    const authHeader = req.headers.authorization;
    if(!authHeader){
        res.status(403).send('Unauthorized Access!');
    }
    // take the 2nd index of authHeader;
    const token = authHeader?.split(' ')[1];
    console.log(token)
    // verify jwt
    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
        if(err){
            res.status(403).send({message: 'Forbidden Access!'})
        }
        req.decoded = decoded;
        next();
    })
}


async function run(){
    try{
        const appointmentOptionsCollection = client.db('doctorsHub').collection('appointmentOptions');
        const bookingCollection = client.db('doctorsHub').collection('bookings');
        const usersCollection = client.db('doctorsHub').collection('users');
        const doctorsCollection = client.db('doctorsHub').collection('doctors');
        const paymentsCollection = client.db('doctorsHub').collection('payments');

        // It will run after jwt verify
        const verifyAdmin= async(req, res, next)=>{
            console.log("indise admin verify", req.decoded.email);
            const decodedEmail= req.decoded.email;
            const query = {email: decodedEmail};
            const user = await usersCollection.findOne(query);
            if(user?.role !== 'admin'){
                return res.status(403).send({message: 'Forbidden Access!'})
            }
            next();
        }
        
        //1 - get all data from database
        app.get('/appointmentOptions', async(req, res)=>{
            const date = req.query.date;
            // console.log(date);
            const query = {};
            const options = await appointmentOptionsCollection.find(query).toArray();
            
            // date qeury for booked date
            const bookingQuery = {appointmentDate: date};
            // get the booked date of provided
            const bookedDate = await bookingCollection.find(bookingQuery).toArray();

            //** */ below code - code carefully
            options.forEach(option=>{
                const optionsBooked = bookedDate.filter(book=>book.treatment === option.name);
                const bookedSlot = optionsBooked.map(book=>book.appointmentTime);
                const leftAppointmentTime = option.slots.filter(slot=> !bookedSlot.includes(slot));
                option.slots = leftAppointmentTime;
                // console.log(date, option.name, leftAppointmentTime.length);
            });
            
            res.send(options);
        });

        // get special task or heading form db
        app.get('/appointmentSpeciality', async(req, res)=>{
            const query = {};
            const result = await appointmentOptionsCollection.find(query).project({name: 1}).toArray();
            res.send(result);
        });

        // get booking all from specific email address
        app.get('/bookings', verifyJWT, async (req, res)=>{
            let email = req.query.email;
            console.log(email);
            const decodedEmail = req.decoded.email;
            // const decodedEmail = req.decoded.EmailAddress;
            if(email !== decodedEmail){
                return res.status(403).send({message: 'Forbidden Access!'})
            }
            const query= {EmailAddress: email};
            // const query= {email: email}; showin in vdo
            // const query= {};
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
        });

        // get payment option from specific id
        app.get('/bookings/:id', async(req, res)=>{
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })

        // post bookings
        app.post('/bookings', async(req, res)=>{
            const booking = req.body;
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment
            };
            const alreadyBooked = await bookingCollection.find(query).toArray();
            if(alreadyBooked.length){
                const message = `You have already booked on ${booking.appointmentDate}`;
                return res.send({acknowledged: false, message});
            }
            // console.log(booking);
            const result = await bookingCollection.insertOne(booking);
            // stop double booking from same user, same date and same time
            
            res.send(result);
        });

        // stripe api
        app.post('/create-payment-intent', async (req, res)=>{
            const booking = req.body;
            
            const price = booking.price;
            const amount = parseInt(price)*100;
            console.log(amount)

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                // "payment-methods-type": [
                //     'card'
                // ]
                "payment_method_types": [
                    "card"
                ]
            });
            // console.log(paymentIntent);
            res.send({
                clientSecret: paymentIntent.client_secret,
              });
        })
        
        // JWT 
        app.get('/jwt', async(req, res)=>{
            const email = req.query.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);

            // user available condition
            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'});
                return res.send({accessToken: token});
            }
            // console.log(user);
            res.status(403).send({AccessToken: ""});
        });

        // verify Admin

        // get all users
        app.get('/users', async(req, res)=>{
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });
        // check whether user admin or not
        app.get('/users/admin/:email', async(req, res)=>{
            const email = req.params.email;
            const query = {email};
            const user = await usersCollection.findOne(query);
            res.send({isAdmin: user?.role === 'admin'});
        })

        // post users 
        app.post('/users', async(req, res)=>{
            const user = req.body;
            // console.log(user)
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // make admin api
        app.put('/users/admin/:id', verifyJWT, async(req, res)=>{
        // if user not admin
            // const decodedEmail= req.decoded.email;
            // const query = {email: decodedEmail};
            // const user = await usersCollection.findOne(query);
            // if(user?.role !== 'admin'){
            //     return res.status(403).send({message: 'Forbidden Access!'})
            // }

            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });
        // payment api
        app.post('/payments', async(req, res)=>{
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.bookingId;
            const filter = {_id: ObjectId(id)};
            const updatedDoc ={
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })



        // temporary updata treatement price 
        // app.get('/addPrice', async (req, res)=>{
        //     const filter = {};
        //     const options = {upsert: true};
        //     const updatedDoc = {
        //         $set: {
        //             price: 120
        //         }
        //     }
        //     const result = await appointmentOptionsCollection.updateMany(filter, updatedDoc, options);
        //     res.send(result);
        // });

        // get all doctors
        app.get('/doctors', verifyJWT, verifyAdmin, async(req, res)=>{
            const query = {};
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        });
        // post doctors
        app.post('/doctors', verifyJWT, verifyAdmin, async(req, res)=>{
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        });
        // delete
        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async(req, res)=>{
            const id = req.params.id;
            const filter = {_id: ObjectId(id)}
            const result = await doctorsCollection.deleteOne(filter);
            res.send(result);
        })
    }
    finally{}
}
run().catch(console.log)








app.get('/', async(req, res)=>{
    res.send('docotors hub');
});

app.listen(port, ()=>{
    console.log(`docots hub on ${port}`);
})
