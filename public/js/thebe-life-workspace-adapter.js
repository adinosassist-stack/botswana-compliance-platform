/* Thebe Life opt-in adapter for the EXISTING Workspace shell.
 * The authenticated host must enforce entitlement server-side before invoking.
 * This module never adds navigation, loads account data or changes routes.
 */
(function(global) {
  'use strict';
  const mounted = new WeakMap();
  function fail(reason) { return Object.freeze({mounted:false,reason}); }
  function mountAuthorized({outlet,authorization,source='workspace',privateBeta=null}={}) {
    if (source !== 'workspace') return fail('invalid_host');
    if (!(outlet instanceof Element) || !outlet.isConnected) return fail('invalid_outlet');
    const shell = outlet.closest('#appShell');
    if (!shell || !shell.contains(outlet) || outlet.closest('#marketingGate,#authGate')) return fail('outside_workspace_shell');
    if (!authorization || authorization.signedIn !== true ||
        authorization.lifeEntitled !== true ||
        authorization.serverVerified !== true) return fail('life_access_not_verified');
    if (!global.ThebeLifeWorkspacePreview || typeof global.ThebeLifeWorkspacePreview.mount !== 'function') return fail('life_component_missing');
    if (mounted.has(outlet)) return fail('already_mounted');
    // Deliberately no new AI dock, header, sidebar or navigation state.
    // Private beta requires an explicit server-authenticated host decision.
    // Nothing is loaded unless the host supplies a verified entitlement and
    // a synthetic-only staging group identifier with the beta opt-in.
    const betaAllowed=privateBeta?.enabled===true &&
      privateBeta?.syntheticOnly===true &&
      typeof privateBeta?.groupId==='string' &&
      /^[A-Za-z0-9_-]{1,80}$/.test(privateBeta.groupId);
    const controller = global.ThebeLifeWorkspacePreview.mount(outlet,{
      privateBeta:betaAllowed?Object.freeze({enabled:true,groupId:privateBeta.groupId}):null
    });
    if (!controller || typeof controller.destroy !== 'function') return fail('invalid_component_controller');
    mounted.set(outlet,controller);
    return Object.freeze({mounted:true,reason:'demo_only'});
  }
  function unmount(outlet) {
    if (!(outlet instanceof Element)) return false;
    const controller = mounted.get(outlet);
    if (!controller) return false;
    controller.destroy();
    mounted.delete(outlet);
    return true;
  }
  global.ThebeLifeWorkspaceAdapter=Object.freeze({mountAuthorized,unmount});
})(window);
