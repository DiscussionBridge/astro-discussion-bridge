# Local HTTPS test fixture only

The adjacent self-signed certificate and openly published EC key are disposable
test material, not a deployment credential or an operating-system trust root.
They cover only the reserved `.example` names `xn--7u3d.example` and
`xn--x-b-bla93z87e2z2c.example`. Tests explicitly trust the certificate only on
their own intercepted request to a loopback listener; product code receives no
custom CA, DNS hook, certificate-check bypass or test option.

Generated with the existing Git OpenSSL executable on 2026-10-31 UTC:

```sh
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -days 36500 -keyout test-only-key.pem -out test-only-cert.pem \
  -subj '/CN=xn--7u3d.example' \
  -addext 'subjectAltName=DNS:xn--7u3d.example,DNS:xn--x-b-bla93z87e2z2c.example'
```

Only the existing Node HTTPS/TLS/crypto modules are required to run the tests. OpenSSL
is not invoked by the tests and is not a new development or hosting prerequisite.

The product's request-scoped hostname callback uses Node's X509Certificate
checker on the original peer certificate and the pinned ASCII hostname. It does
not disable certificate checking or supply a CA. The fixture asserts that this
callback and `rejectUnauthorized: true` are present before adding its local CA;
untrusted certificates, mismatched names and malformed peer data are rejected.
