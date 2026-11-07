import assert from 'node:assert/strict';
import test from 'node:test';
import { systemShareSheetAvailable } from '../browser/share.js';

function fakeWindow({ share = () => {}, coarse = false, mobile = undefined } = {}) {
  return {
    navigator:
      share === null ? {} : { share, userAgentData: mobile === undefined ? undefined : { mobile } },
    matchMedia: (query) => ({ matches: query === '(pointer: coarse)' ? coarse : false }),
  };
}

test('the system share sheet stays a phone affordance', () => {
  // Phone with a touch pointer: the sheet is offered.
  assert.equal(systemShareSheetAvailable(fakeWindow({ coarse: true })), true);
  // A coarse-pointer tablet without a share implementation is not shareable.
  assert.equal(systemShareSheetAvailable(fakeWindow({ share: null, coarse: true })), false);
  // Desktop Chromium exposes navigator.share, but the sheet is missing or crashes there.
  assert.equal(systemShareSheetAvailable(fakeWindow({ coarse: false })), false);
  assert.equal(systemShareSheetAvailable(fakeWindow({ coarse: false, mobile: false })), false);
  // A device that identifies itself as mobile keeps the sheet without a coarse pointer.
  assert.equal(systemShareSheetAvailable(fakeWindow({ coarse: false, mobile: true })), true);
  // Missing platform objects must not throw.
  assert.equal(systemShareSheetAvailable(undefined), false);
  assert.equal(systemShareSheetAvailable({}), false);
  assert.equal(systemShareSheetAvailable({ navigator: {} }), false);
  assert.equal(systemShareSheetAvailable({ navigator: { share() {} } }), false);
});
