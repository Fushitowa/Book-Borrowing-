import { Router } from 'express';
import { currentUser, login, logout } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const authRouter = Router();
authRouter.post('/login', (request, response, next) => { void login(request, response).catch(next); });
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, currentUser);
