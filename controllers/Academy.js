const AsyncWrapper =
    require('../middleware/AsyncWrapper');

const Academy =
    require('../models/Academy');

const Supervisor =
    require('../models/Supervisor');

const User =
    require('../models/User');

const app_error =
    require('../utils/AppError');

const http_status_text =
    require('../utils/HttpStatusText');

const jwt =
    require('jsonwebtoken');

const crypto =
    require('crypto');

const BlacklistedToken =
    require('../models/BlacklistedToken');

    const gen_token =
    require('../utils/gen_token');

const bcrypt =
    require('bcrypt');

const { normalizeCurrency } =
    require('../utils/Currency');

const salt_round =
    Number(process.env.salt_round);


// =====================================================
// Register Academy
// =====================================================

const register = AsyncWrapper(

    async (req, res, next) => {

        const {
            academy_name,
            manager_phone,
            manager_name,
            academy_code,
            password,
            currency
        } = req.body;


        if (
            !academy_name ||
            !manager_phone ||
            !manager_name ||
            !academy_code ||
            !password
        ) {

            const error =
                new app_error();

            error.create(
                'academy_name, manager_phone, manager_name, academy_code and password are required',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }

        let academyCurrency;

        try {
            academyCurrency = normalizeCurrency(currency);
        } catch (error) {
            return next(error);
        }


        const academy_by_code =
            await Academy.findOne({
                academy_code
            });


        if (academy_by_code) {

            const error =
                new app_error();

            error.create(
                'academy with this academy_code already exists',
                409,
                http_status_text.FAIL
            );

            return next(error);
        }


        const academy_by_phone =
            await Academy.findOne({
                manager_phone
            });


        if (academy_by_phone) {

            const error =
                new app_error();

            error.create(
                'academy with this manager_phone already exists',
                409,
                http_status_text.FAIL
            );

            return next(error);
        }


        const hashed_password =
            await bcrypt.hash(
                password,
                salt_round
            );


        const academy =
            new Academy({

                academy_name,

                manager_phone,

                manager_name,

                academy_code,

                currency:
                    academyCurrency,

                password:
                    hashed_password,

                is_active:
                    false

            });


        await academy.save();


        const token =
            await gen_token({

                id:
                    academy._id,

                manager_name:
                    academy.manager_name,

                manager_phone:
                    academy.manager_phone,

                role:
                    'academy_admin'

            });


        academy.password =
            undefined;


        return res.status(201).json({

            status:
                http_status_text.SUCCESS,

            data: {

                academy,

                token

            }

        });

    }

);


// =====================================================
// Academy Login
// =====================================================

const login = AsyncWrapper(

    async (req, res, next) => {

        const {
            manager_phone,
            password
        } = req.body;


        if (
            !manager_phone ||
            !password
        ) {

            const error =
                new app_error();

            error.create(
                'manager_phone and password required',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        const academy =
            await Academy.findOne({
                manager_phone
            });


        if (!academy) {

            const error =
                new app_error();

            error.create(
                'user or password are wrong',
                401,
                http_status_text.FAIL
            );

            return next(error);
        }


        const matched_password =
            await bcrypt.compare(
                password,
                academy.password
            );


        if (!matched_password) {

            const error =
                new app_error();

            error.create(
                'user or password are wrong',
                401,
                http_status_text.FAIL
            );

            return next(error);
        }


        if (!academy.is_active) {

            const error =
                new app_error();

            error.create(
                'academy is not active',
                403,
                http_status_text.FAIL
            );

            return next(error);
        }


        const token =
            await gen_token({

                id:
                    academy._id,

                manager_name:
                    academy.manager_name,

                manager_phone:
                    academy.manager_phone,

                role:
                    'academy_admin'

            });


        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            data: {

                token

            }

        });

    }

);


// =====================================================
// Academy Logout
// =====================================================

const logout = AsyncWrapper(

    async (req, res, next) => {

        const auth_header =
            req.headers['authorization'];


        if (!auth_header) {

            const error =
                new app_error();

            error.create(
                'required token',
                401,
                http_status_text.ERROR
            );

            return next(error);
        }


        const parts =
            auth_header.split(' ');


        if (
            parts.length !== 2 ||
            parts[0] !== 'Bearer' ||
            !parts[1]
        ) {

            const error =
                new app_error();

            error.create(
                'invalid authorization header',
                401,
                http_status_text.ERROR
            );

            return next(error);
        }


        const token =
            parts[1];


        // =================================================
        // Verify Token
        // =================================================

        let decoded;

        try {

            decoded =
                jwt.verify(
                    token,
                    process.env.JWT_SECRET
                );

        } catch (error) {

            const auth_error =
                new app_error();

            auth_error.create(
                'invalid token',
                401,
                http_status_text.ERROR
            );

            return next(auth_error);
        }


        // =================================================
        // Hash Token
        // =================================================

        const token_hash =
            crypto
                .createHash('sha256')
                .update(token)
                .digest('hex');


        // =================================================
        // Token Expiration
        // =================================================

        const expires_at =
            new Date(
                decoded.exp * 1000
            );


        // =================================================
        // Add Token To Blacklist
        // =================================================

        await BlacklistedToken.findOneAndUpdate(

            {
                token_hash
            },

            {
                token_hash,

                expires_at

            },

            {
                upsert:
                    true,

                new:
                    true,

                setDefaultsOnInsert:
                    true
            }

        );


        // =================================================
        // Response
        // =================================================

        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            message:
                'logout successfully'

        });

    }

);

// =====================================================
// Get Academy Profile
// =====================================================

const getMyAcademy = AsyncWrapper(
    async (req, res, next) => {
        const academy_id = req.user.id;

        // تم إضافة -finance لمنع استرجاع بيانات المالية في الـ Response
        const academy = await Academy.findById(academy_id)
            .select('-password -__v -finance');

        if (!academy) {
            const error = new app_error();
            error.create(
                'academy not found',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }

        return res.status(200).json({
            status: http_status_text.SUCCESS,
            data: {
                academy
            }
        });
    }
);


// =====================================================
// Update Academy
// =====================================================

const updateAcademy = AsyncWrapper(

    async (req, res, next) => {

        const academy_id =
            req.user.id;


        const {
            academy_name,
            manager_name,
            manager_phone
        } = req.body;


        const academy =
            await Academy.findById(
                academy_id
            );


        if (!academy) {

            const error =
                new app_error();

            error.create(
                'academy not found',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        if (
            manager_phone &&
            manager_phone !==
                academy.manager_phone
        ) {

            const existing_academy =
                await Academy.findOne({

                    manager_phone,

                    _id: {
                        $ne:
                            academy_id
                    }

                });


            if (existing_academy) {

                const error =
                    new app_error();

                error.create(
                    'this manager phone already belongs to another academy',
                    409,
                    http_status_text.FAIL
                );

                return next(error);
            }


            academy.manager_phone =
                manager_phone;
        }


        if (academy_name) {

            academy.academy_name =
                academy_name;

        }


        if (manager_name) {

            academy.manager_name =
                manager_name;

        }


        await academy.save();


        const updated_academy =
            await Academy.findById(
                academy_id
            ).select('-password -__v');


        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            data: {

                academy:
                    updated_academy

            }

        });

    }

);


// =====================================================
// Change Academy Password
// =====================================================

const changePassword = AsyncWrapper(

    async (req, res, next) => {

        const academy_id =
            req.user.id;


        const {
            old_password,
            new_password
        } = req.body;


        if (
            !old_password ||
            !new_password
        ) {

            const error =
                new app_error();

            error.create(
                'old_password and new_password are required',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        const academy =
            await Academy.findById(
                academy_id
            );


        if (!academy) {

            const error =
                new app_error();

            error.create(
                'academy not found',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        const matched_password =
            await bcrypt.compare(
                old_password,
                academy.password
            );


        if (!matched_password) {

            const error =
                new app_error();

            error.create(
                'old password is wrong',
                401,
                http_status_text.FAIL
            );

            return next(error);
        }


        const hashed_password =
            await bcrypt.hash(
                new_password,
                salt_round
            );


        academy.password =
            hashed_password;


        await academy.save();


        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            message:
                'password changed successfully'

        });

    }

);


// =====================================================
// Create Supervisor
// User must already exist
// =====================================================

const createSupervisor = AsyncWrapper(
    async (req, res, next) => {

        const academy_id =
            req.user.id;

        const {
            phone
        } = req.body;


        // =================================================
        // Validation
        // =================================================

        if (!phone) {

            const error =
                new app_error();

            error.create(
                'phone is required',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        // =================================================
        // Check Academy
        // =================================================

        const academy =
            await Academy.findById(
                academy_id
            );

        if (!academy) {

            const error =
                new app_error();

            error.create(
                'academy not found',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        // =================================================
        // Find Existing User
        // =================================================

        const user =
            await User.findOne({
                phone
            });

        if (!user) {

            const error =
                new app_error();

            error.create(
                'user does not exist. Please create a user account first',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        // =================================================
        // Check User Role
        // =================================================

        if (
            user.role !==
            'supervisor'
        ) {

            const error =
                new app_error();

            error.create(
                'this user is not a supervisor',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        // =================================================
        // Check Already Added To This Academy
        // =================================================

        const existing_supervisor =
            await Supervisor.findOne({

                user:
                    user._id,

                academy_id

            });

        if (existing_supervisor) {

            const error =
                new app_error();

            error.create(
                'this supervisor is already added to this academy',
                409,
                http_status_text.FAIL
            );

            return next(error);
        }


        // =================================================
        // Create Supervisor
        // =================================================

        const supervisor =
            new Supervisor({

                user:
                    user._id,

                academy_id,

                is_active:
                    true
            });


        await supervisor.save();


        // =================================================
        // Get Created Supervisor
        // =================================================

        const created_supervisor =
            await Supervisor
                .findById(
                    supervisor._id
                )
                .populate(
                    'user',
                    'name phone role is_active'
                );


        // =================================================
        // Response
        // =================================================

        return res.status(201).json({

            status:
                http_status_text.SUCCESS,

            data: {

                supervisor:
                    created_supervisor

            }

        });

    }
);





//=====================================================
// get all supervisor
// academy admin
//=====================================================

const getAllSupervisors = AsyncWrapper(
    async (req, res, next) => {

        const academy_id = req.user.id;

        const supervisors =
            await Supervisor
                .find({
                    academy_id: academy_id
                })
                .populate(
                    'user',
                    'name phone role is_active'
                )
                .sort({
                    createdAt: -1
                });

        return res.status(200).json({
            status: 'success',

            results: supervisors.length,

            data: supervisors
        });
    }
);

// =====================================================
// Get Single Academy
// =====================================================

const getSingleSupervisor = AsyncWrapper(
    async (req, res, next) => {

        const academy_id = req.user.id;

        const { supervisor_id } =
            req.params;

        const supervisor =
            await Supervisor
                .findOne({
                    _id: supervisor_id,
                    academy_id: academy_id
                })
                .populate(
                    'user',
                    'name phone role is_active'
                );

        if (!supervisor) {

            const error =
                new app_error();

            error.create(
                'Supervisor not found',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }

        return res.status(200).json({
            status: 'success',

            data: supervisor
        });
    }
);

// =====================================================
// Activate Supervisor
// Academy Admin
// =====================================================

const patchActiveSupervisor = AsyncWrapper(

    async (req, res, next) => {

        const academy_id =
            req.user.id;

        const { supervisor_id } =
            req.params;


        if (!supervisor_id) {

            const error =
                new app_error();

            error.create(
                'supervisor_id is required',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        const supervisor =
            await Supervisor.findOne({

                _id:
                    supervisor_id,

                academy_id

            });


        if (!supervisor) {

            const error =
                new app_error();

            error.create(
                'supervisor not found in this academy',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        supervisor.is_active =
            true;


        await supervisor.save();


        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            data: {

                supervisor

            }

        });

    }

);


// =====================================================
// Stop Supervisor
// Academy Admin
// =====================================================

const patchStopSupervisor = AsyncWrapper(

    async (req, res, next) => {

        const academy_id =
            req.user.id;


        const {
            supervisor_id
        } = req.params;


        if (!supervisor_id) {

            const error =
                new app_error();

            error.create(
                'supervisor_id is required',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        const supervisor =
            await Supervisor.findOne({

                _id:
                    supervisor_id,

                academy_id

            });


        if (!supervisor) {

            const error =
                new app_error();

            error.create(
                'supervisor not found in this academy',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        supervisor.is_active =
            false;


        await supervisor.save();


        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            data: {

                supervisor

            }

        });

    }

);


module.exports = {

    register,

    login,

    logout,

    getMyAcademy,

    updateAcademy,

    changePassword,

    createSupervisor,

    patchActiveSupervisor,

    patchStopSupervisor,

    getAllSupervisors,

    getSingleSupervisor
};