export const AWS_EMAIL_CALLBACK = 'https://prodtest.useadtool.ai/auth/callback';
export const AWS_RECOVERY_URI = '/auth/v1/recover?redirect_to=' + encodeURIComponent(AWS_EMAIL_CALLBACK);
export type AwsEmailCallback = {kind:'none'|'invalid'} | {kind:'signup'|'recovery'; accessToken:string};
/** Capture once before the SDK consumes the fragment. No browser persistence or logging. */
export function readAwsEmailCallback(location:Pick<Location,'pathname'|'search'|'hash'>):AwsEmailCallback {
 if(location.pathname!=='/auth/callback') return {kind:'none'};
 if(location.search || location.hash.length>16000) return {kind:'invalid'};
 const params=new URLSearchParams(location.hash.slice(1));
 const allowed=new Set(['access_token','refresh_token','type','token_type','expires_in','expires_at']);
 for(const key of params.keys()) if(!allowed.has(key)||params.getAll(key).length!==1)return {kind:'invalid'};
 const kind=params.get('type'),accessToken=params.get('access_token')??'',refresh=params.get('refresh_token')??'';
 if((kind!=='signup'&&kind!=='recovery') || params.get('token_type')!=='bearer' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken) || accessToken.length>8000 || !/^[A-Za-z0-9_-]{8,2048}$/.test(refresh) || !/^\d{1,6}$/.test(params.get('expires_in')??''))return {kind:'invalid'};
 return {kind,accessToken};
}
export function isAwsEmailAuthRequest(uri:string,method:string):boolean {
 return method==='POST'&&uri===AWS_RECOVERY_URI || method==='PUT'&&uri==='/auth/v1/user';
}
export function validAwsRecoveryPassword(value:string):boolean {
 return value.length>=12&&value.length<=256&&/\p{L}/u.test(value)&&/[\d\W_]/.test(value);
}
