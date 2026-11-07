using System.IO.Pipes;
using System.Security.Principal;

namespace CertifBuddy.Infrastructure;

public sealed class SingleInstanceCoordinator : IDisposable
{
    private const string ActivationCommand = "ACTIVATE";
    private const int ConnectionAttempts = 20;
    private const int ConnectionTimeoutMilliseconds = 500;
    private const int RetryDelayMilliseconds = 100;

    private readonly Mutex _mutex;
    private readonly string _pipeName;
    private readonly CancellationTokenSource _cancellationTokenSource = new();
    private Task? _listenerTask;
    private bool _disposed;

    public SingleInstanceCoordinator()
    {
        var userSid = WindowsIdentity.GetCurrent().User?.Value
            ?? throw new InvalidOperationException(
                "Impossible d’identifier l’utilisateur Windows courant.");
        using var currentProcess = System.Diagnostics.Process.GetCurrentProcess();
        var sessionId = currentProcess.SessionId;

        _mutex = new Mutex(
            initiallyOwned: true,
            name: $@"Local\CertifBuddy-{userSid}-{sessionId}",
            createdNew: out var createdNew);
        IsPrimaryInstance = createdNew;
        _pipeName = $"CertifBuddy-{userSid}-{sessionId}";
    }

    public bool IsPrimaryInstance { get; }

    public async Task<bool> NotifyExistingInstanceAsync(
        CancellationToken cancellationToken = default)
    {
        for (var attempt = 0; attempt < ConnectionAttempts; attempt++)
        {
            try
            {
                await using var client = new NamedPipeClientStream(
                    ".",
                    _pipeName,
                    PipeDirection.Out,
                    PipeOptions.Asynchronous);
                await client.ConnectAsync(ConnectionTimeoutMilliseconds, cancellationToken);
                await using var writer = new StreamWriter(client, leaveOpen: true);
                await writer.WriteLineAsync(ActivationCommand);
                await writer.FlushAsync(cancellationToken);
                return true;
            }
            catch (IOException) when (attempt + 1 < ConnectionAttempts)
            {
                await Task.Delay(RetryDelayMilliseconds, cancellationToken);
            }
            catch (TimeoutException) when (attempt + 1 < ConnectionAttempts)
            {
                await Task.Delay(RetryDelayMilliseconds, cancellationToken);
            }
        }

        return false;
    }

    public Task StartActivationListener(Action onActivated)
    {
        ArgumentNullException.ThrowIfNull(onActivated);
        if (!IsPrimaryInstance)
        {
            throw new InvalidOperationException(
                "Seule l’instance principale peut écouter les demandes d’activation.");
        }

        if (_listenerTask is not null)
        {
            throw new InvalidOperationException(
                "Le service d’activation de l’instance est déjà démarré.");
        }

        _listenerTask = ListenForActivationAsync(onActivated, _cancellationTokenSource.Token);
        return _listenerTask;
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _cancellationTokenSource.Cancel();
        if (_listenerTask is null)
        {
            _cancellationTokenSource.Dispose();
        }
        else
        {
            _ = _listenerTask.ContinueWith(
                _ => _cancellationTokenSource.Dispose(),
                CancellationToken.None,
                TaskContinuationOptions.ExecuteSynchronously,
                TaskScheduler.Default);
        }

        if (IsPrimaryInstance)
        {
            _mutex.ReleaseMutex();
        }

        _mutex.Dispose();
    }

    private async Task ListenForActivationAsync(
        Action onActivated,
        CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            await using var server = new NamedPipeServerStream(
                _pipeName,
                PipeDirection.In,
                maxNumberOfServerInstances: 1,
                PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            await server.WaitForConnectionAsync(cancellationToken);

            using var reader = new StreamReader(server, leaveOpen: true);
            var command = await reader.ReadLineAsync(cancellationToken);
            if (string.Equals(command, ActivationCommand, StringComparison.Ordinal))
            {
                onActivated();
            }
        }
    }
}
