import { Router } from 'express';
import { currentUser, login, logout, register } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const authRouter = Router();
authRouter.post('/login', (request, response, next) => { void login(request, response).catch(next); });
authRouter.post('/register', (request, response, next) => { void register(request, response).catch(next); });
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, currentUser);
