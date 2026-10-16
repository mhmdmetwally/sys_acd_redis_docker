
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const http_status_text =
    require('./utils/HttpStatusText');

const admin_routes =
    require('./routes/Admin');

const academy_routes =
    require('./routes/Academy');

const user_routes =
    require('./routes/User');

const teacher_routes =
    require('./routes/Teacher');

const student_routes =
    require('./routes/Student');

const supervisor_routes =
    require('./routes/Supervisor');

const family_routes =
    require('./routes/Family');


const subject_routes =
    require('./routes/Subject');

const student_subject_routes =
    require('./routes/StudentSubject');

const lesson_routes =
    require('./routes/Lesson');

const teacher_payroll_routes =
    require('./routes/TeacherPayroll');

const supervisor_payroll_routes = 
    require('./routes/SupervisorPayroll');

const family_discount_router =
    require('./routes/FamilyDiscount');

const invoice_routes =
    require('./routes/Invoice');

const payment_routes =
    require('./routes/Payment');

const expense_routes =
    require('./routes/Expense');

const financial_report_routes =
    require('./routes/FinancialReport');


const app = express();


// =====================================================
// MongoDB Connection
// =====================================================

let is_connected = false;

const connectDB = async () => {

    // Already connected
    if (
        is_connected &&
        mongoose.connection.readyState === 1
    ) {
        return;
    }

    // Connection is already in progress
    if (
        mongoose.connection.readyState === 2
    ) {
        return;
    }

    const url =
        process.env.MONGO_URL;

    if (!url) {

        console.error(
            'MONGO_URL is not defined'
        );

        throw new Error(
            'MONGO_URL is not defined'
        );
    }

    try {

        await mongoose.connect(url);

        is_connected = true;

        console.log(
            'MongoDB connected'
        );

    } catch (error) {

        is_connected = false;

        console.error(
            'MongoDB connection failed:',
            error
        );

        throw error;
    }
};


// =====================================================
// Middleware
// =====================================================

app.use(cors());

app.use(express.json());


// =====================================================
// MongoDB Middleware
// =====================================================

app.use(
    async (req, res, next) => {

        try {

            await connectDB();

            next();

        } catch (error) {

            next(error);

        }

    }
);


// =====================================================
// Home
// =====================================================

app.get("/", (req, res) => {

    res.json({
        msg: "API running"
    });

});


// =====================================================
// Test
// =====================================================

app.get('/test', (req, res) => {

    res.json({

        mongo:
            process.env.MONGO_URL
                ? 'MONGO_URL exists'
                : 'MONGO_URL missing',

        mongo_state:
            mongoose.connection.readyState

    });

});


// =====================================================
// Routes
// =====================================================

app.use(
    '/academy',
    academy_routes
);

app.use(
    '/admin',
    admin_routes
);

app.use(
    '/user',
    user_routes
);

app.use(
    '/teacher',
    teacher_routes
);

app.use(
    '/student',
    student_routes
);

app.use(
    '/supervisor',
    supervisor_routes
);

app.use(
    '/family',
    family_routes
);

app.use(
    '/subject',
    subject_routes
);

app.use(
    '/student-subject',
    student_subject_routes
);

app.use(
    '/lesson',
    lesson_routes
);

app.use(
    '/teacher-payroll',
    teacher_payroll_routes
);

app.use(
    '/supervisor-payroll',
    supervisor_payroll_routes
);


app.use(
    '/family-discount',
    family_discount_router
);

app.use(
    '/invoice',
    invoice_routes
);

app.use(
    '/payment',
    payment_routes
);

app.use(
    '/expense',
    expense_routes
);

app.use(
    '/financial',
    financial_report_routes
);


// =====================================================
// 404
// =====================================================

app.use((req, res) => {

    res.status(404).json({

        status:
            http_status_text.FAIL,

        msg:
            'Not found'

    });

});


// =====================================================
// Error Handler
// =====================================================

app.use((err, req, res, next) => {

    console.error(
        'ERROR:',
        err
    );

    res.status(
        err.status_code || 500
    ).json({

        status:
            err.status_text ||
            http_status_text.ERROR,

        msg:
            err.message,

        code:
            err.status_code || 500

    });

});


if (require.main === module) {
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, () => {
        console.log(`API listening on port ${port}`);
    });
}

module.exports = app;

