// Listed FIRST in app.json: mods run in reverse plugin order, so this one
// runs after expo-notifications has written its entitlement.
// expo-notifications always adds the aps-environment entitlement, but every
// reminder here is a local notification — there is no push server. A free
// (personal-team) Apple ID cannot sign that entitlement, so it blocks Xcode
// installs, and App Review asks why an app with no push declares it.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
