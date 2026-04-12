import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';
/**
 * Mark a route as "optional auth":
 * — If a valid Bearer token is present, `req.user` is populated.
 * — If no token (or an invalid one) is present, the request is allowed through
 *   with `req.user` left undefined. reporter_uid stays null in that case.
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
