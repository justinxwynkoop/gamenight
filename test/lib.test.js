import test from 'node:test';
import assert from 'node:assert/strict';
import { pickAddress } from '../lib.js';

const v4 = (address, internal = false) => ({ family: 'IPv4', address, internal });

test('picks the first real IPv4 address', () => {
  assert.equal(pickAddress({ lo: [v4('127.0.0.1', true)], wlan0: [v4('192.168.50.23')] }), '192.168.50.23');
});

test('skips IPv6, loopback and virtual interfaces', () => {
  assert.equal(pickAddress({
    lo: [v4('127.0.0.1', true)],
    docker0: [v4('172.17.0.1')],
    veth1a2b: [v4('172.18.0.1')],
    'br-0123': [v4('172.19.0.1')],
    eth0: [{ family: 'IPv6', address: 'fe80::1', internal: false }, v4('10.0.0.8')],
  }), '10.0.0.8');
});

test('prefers a real address over a 169.254 "no DHCP answer" one, but uses it if it is all there is', () => {
  assert.equal(pickAddress({ eth0: [v4('169.254.3.4')], wlan0: [v4('192.168.1.9')] }), '192.168.1.9');
  assert.equal(pickAddress({ eth0: [v4('169.254.3.4')] }), '169.254.3.4');
});

test('with no network at all the answer is localhost', () => {
  assert.equal(pickAddress({ lo: [v4('127.0.0.1', true)] }), 'localhost');
  assert.equal(pickAddress({}), 'localhost');
  assert.equal(pickAddress(undefined), 'localhost');
});

test('the answer follows the network: a new set of interfaces gives a new address', () => {
  const home = { wlan0: [v4('192.168.4.20')] };
  const party = { wlan0: [v4('10.20.30.7')] };
  assert.notEqual(pickAddress(home), pickAddress(party));
  assert.equal(pickAddress(party), '10.20.30.7');
});

test('Node versions that report the family as the number 4 work too', () => {
  assert.equal(pickAddress({ wlan0: [{ family: 4, address: '10.1.1.1', internal: false }] }), '10.1.1.1');
});
