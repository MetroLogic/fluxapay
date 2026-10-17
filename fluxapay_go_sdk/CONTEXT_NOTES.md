# Note to maintainers: context propagation (#1330)

Every resource method in `fluxapay/client.go` already takes `ctx context.Context` as its first
parameter, and `Client.do` builds requests with `http.NewRequestWithContext(ctx, ...)`. Errors from
`http.Client.Do` are wrapped with `%w`, so `errors.Is(err, context.Canceled)` and
`errors.Is(err, context.DeadlineExceeded)` work. This change adds tests (`context_support_test.go`)
asserting prompt return on cancel and deadline, and documents usage:

```go
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

payment, err := client.Payments.Get(ctx, "pay_123")
if errors.Is(err, context.DeadlineExceeded) {
    // request took too long
}
```
