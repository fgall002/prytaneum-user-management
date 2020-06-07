import { ObjectID } from 'mongodb';
import request from 'supertest';

import app from 'app';
import Users from 'db/users';
import Accounts from 'lib/accounts';
import jwt from 'lib/jwt/jwt';
import connect from 'db/connect';
import Mongo from 'db/mongo';
import { _test as EnvTest } from 'config/env';

const { env } = EnvTest;

const mockUser = {
    username: '__test__',
    password: '1',
    email: '__test__@__test__.com',
    userRoles: ['user'],
    _id: new ObjectID(),
};

beforeAll(async () => {
    await connect();
    const { _id } = await Accounts.register(
        mockUser.username,
        mockUser.password,
        mockUser.password,
        {
            email: mockUser.email,
        }
    );
    mockUser._id = _id;
});
afterAll(async () => {
    await Users.removeUser(mockUser.email);
    await Mongo.close();
});

interface Response {
    status: number;
}

describe('users', () => {
    let _jwt: string;

    describe('#login', () => {
        it('should reject the login with no username or password', async () => {
            const { status } = await request(app).post('/api/auth/login');
            expect(status).toStrictEqual(400);
        });
        it('should reject a login with no password', async () => {
            const { status } = await request(app)
                .post('/api/auth/login')
                .send({ username: mockUser.username });
            expect(status).toStrictEqual(400);
        });
        it('should reject a login with incorrect password', async () => {
            const { status } = await request(app).post('/api/auth/login').send({
                username: mockUser.username,
                password: 'wrongpassword',
            });
            expect(status).toStrictEqual(401);
        });
        it('should accept a valid username & password', async () => {
            const { status, body } = (await request(app)
                .post('/api/auth/login')
                .send({
                    username: mockUser.username,
                    password: mockUser.password,
                })) as Response & {
                body: {
                    jwt: string;
                };
            };
            expect(status).toStrictEqual(200);
            _jwt = body.jwt;
        });
        it('should catch if JWT_SECRET is undefined', async () => {
            const cachedSecret = env.JWT_SECRET;
            const cachedEnv = env.NODE_ENV;
            delete env.JWT_SECRET;
            delete env.NODE_ENV;
            const { status } = await request(app).post('/api/auth/login').send({
                username: mockUser.username,
                password: mockUser.password,
            });
            expect(status).toStrictEqual(500);
            env.JWT_SECRET = cachedSecret;
            env.NODE_ENV = cachedEnv;
        });
    });

    // describe('#login-temporary', () => {
    //     it('should succeed', async () => {
    //         const { status, body } = (await request(app)
    //             .post('/api/auth/login-temporary')
    //             .send({
    //                 username: 'fake@fake.com',
    //             })) as Response & {
    //             body: {
    //                 jwt: string;
    //             };
    //         };
    //         const { jwt: token } = body;

    //         expect(status).toStrictEqual(200);
    //         expect(token).toBeTruthy();
    //         await Users.deleteOne({ username: 'fake@fake.com' });
    //     });
    //     it('should fail to login as existing user', async () => {
    //         const { status, body } = (await request(app)
    //             .post('/api/auth/login-temporary')
    //             .send({
    //                 username: mockUser.username,
    //             })) as Response & {
    //             body: {
    //                 jwt: string;
    //             };
    //         };
    //         const { jwt: token } = body;
    //         expect(status).toStrictEqual(400);
    //         expect(token).toBeFalsy();
    //     });
    // });

    describe('#register', () => {
        it('should register a user', async () => {
            const { status } = await request(app)
                .post('/api/auth/register')
                .send({
                    form: {
                        username: 'asdf',
                        email: 'blah@blah.com',
                        password: 'password',
                        confirmPassword: 'password',
                    },
                });
            expect(status).toStrictEqual(200);
            await Users.removeUser('blah@blah.com');
        });
        it('should not register an already existing user', async () => {
            const { status } = await request(app)
                .post('/api/auth/register')
                .send({
                    form: {
                        username: mockUser.username,
                        email: mockUser.email,
                        password: mockUser.password,
                        confirmPassword: mockUser.password,
                    },
                });
            expect(status).toStrictEqual(400);
        });

        it('should not register mismatching passwords', async () => {
            const { status } = await request(app)
                .post('/api/auth/register')
                .send({
                    form: {
                        username: mockUser.username,
                        email: mockUser.email,
                        password: mockUser.password,
                        confirmPassword: 'darude_sandstorm',
                    },
                });
            expect(status).toStrictEqual(400);
        });
    });

    describe('#authenticate', () => {
        it('should accept a valid jwt', async () => {
            const { status } = await request(app)
                .post('/api/auth/authenticate')
                .set('Authorization', `bearer ${_jwt}`);
            expect(status).toStrictEqual(200);
        });
        it('should reject a tampered jwt', async () => {
            const { status } = await request(app)
                .post('/api/auth/authenticate')
                // maybe think of more ways to tamper with the jwt?
                .set('Authorization', `bearer ${_jwt}$`);
            expect(status).toStrictEqual(401);
        });
    });
    describe('#email verification', () => {
        it('should reject an invalid userId', async () => {
            const { status } = await request(app)
                .post('/api/auth/confirm/user-email')
                .send({ userId: new ObjectID() });
            expect(status).toStrictEqual(400);
        });
        it('should accept a valid userId', async () => {
            const { _id } = mockUser;
            const { status } = await request(app)
                .post('/api/auth/confirm/user-email')
                .send({ userId: _id });
            expect(status).toStrictEqual(200);
        });
    });
    describe('#request-password-reset', () => {
        it('should accept valid email', async () => {
            const { status } = await request(app)
                .post('/api/auth/request-password-reset')
                .send({ form: { email: mockUser.email } });
            expect(status).toStrictEqual(200);
        });
        it('should reject undefined email', async () => {
            const { status } = await request(app)
                .post('/api/auth/request-password-reset')
                .send({ form: { email: undefined } });
            expect(status).toStrictEqual(400);
        });
        it('should reject invalid email', async () => {
            const { status } = await request(app)
                .post('/api/auth/request-password-reset')
                .send({ form: { email: 'invalidEmail' } });
            expect(status).toStrictEqual(400);
        });
    });
    describe('#consume-password-reset-token', () => {
        it('should accept valid token', async () => {
            const { _id } = mockUser;
            const token = await jwt.sign(
                { _id },
                {
                    expiresIn: '2m',
                }
            );

            const { status } = await request(app)
                .post('/api/auth/consume-password-reset-token')
                .send({
                    token,
                    form: {
                        password: '1',
                        confirmPassword: '1',
                    },
                });
            expect(status).toStrictEqual(200);
        });
        it('should reject invalid token', async () => {
            const { status } = await request(app)
                .post('/api/auth/consume-password-reset-token')
                .send({
                    form: { password: '1', confirmPassword: '1' },
                })
                .set('Content-Type', 'application/json')
                .send({ token: '123' });
            expect(status).toStrictEqual(400);
        });
        it('should reject missing token', async () => {
            const { status } = await request(app)
                .post('/api/auth/consume-password-reset-token')
                .send({
                    form: { password: '1', confirmPassword: '1' },
                })
                .set('Content-Type', 'application/json')
                .send();
            expect(status).toStrictEqual(400);
        });
        it('should reject expired token', async () => {
            const { _id } = mockUser;
            const token = await jwt.sign(
                { _id },
                {
                    expiresIn: '-10s',
                }
            );

            const { status } = await request(app)
                .post('/api/auth/consume-password-reset-token')
                .send({
                    token,
                    form: {
                        password: '1',
                        confirmPassword: '1',
                    },
                });
            expect(status).toStrictEqual(400);
        });
        it('should reject mismatching password', async () => {
            const { _id } = mockUser;
            const token = await jwt.sign(
                { _id },
                {
                    expiresIn: '2m',
                }
            );

            const { status } = await request(app)
                .post('/api/auth/consume-password-reset-token')
                .send({
                    token,
                    form: { password: '1', confirmPassword: '2' },
                });
            expect(status).toStrictEqual(400);
        });
    });
});
