<script lang="ts">
  import { onMount } from 'svelte';
  import type { CurrentUser } from '@chat/contracts';
  import { ChatPage } from '@pages/chat';
  import { LoginPage } from '@pages/login';
  import { RegisterPage } from '@pages/register';
  import { Alert, Button, P, Spinner } from 'flowbite-svelte';
  import { createAppRuntime } from '../runtime';
  const runtime = createAppRuntime();
  const auth = runtime.auth;
  let registering = $state(false);
  let logoutError = $state('');

  function signedIn(user: CurrentUser, expiresAt: number) {
    registering = false;
    logoutError = '';
    auth.signedIn(user, expiresAt);
  }

  async function logout() {
    logoutError = '';
    try {
      await auth.logout();
    } catch {
      logoutError = 'Unable to sign out. Please try again';
    }
  }

  onMount(() => {
    auth.restore();
    return runtime.dispose;
  });
</script>

<svelte:window onstorage={auth.storageChanged} />
<svelte:document onvisibilitychange={runtime.visibilityChanged} />

<svelte:head
  ><title>Chat</title><meta
    name="description"
    content="Private chat"
  /></svelte:head
>
{#if auth.state.status === 'loading'}
  <main class="grid min-h-dvh place-items-center p-6">
    <div role="status" aria-live="polite" class="flex items-center gap-3">
      <Spinner aria-hidden="true" />
      <P>Checking your session…</P>
    </div>
  </main>
{:else if auth.state.status === 'error'}
  <main class="grid min-h-dvh place-items-center p-6">
    <div class="flex w-full max-w-md flex-col gap-4">
      <Alert color="red" role="alert">{auth.state.error}</Alert>
      <Button onclick={auth.restore}>Try again</Button>
    </div>
  </main>
{:else if auth.state.status === 'authenticated' && runtime.context}
  {@const context = runtime.context}
  <main>
    {#key context}<ChatPage
        api={context.api}
        conversations={context.chat.conversations}
        messages={context.chat.messages}
        userId={auth.state.user.id}
        onSent={context.chat.messageSaved}
        onLogout={logout}
        {logoutError}
      />{/key}
  </main>
{:else if registering}
  <RegisterPage
    api={runtime.api}
    onRegistered={signedIn}
    onSignIn={() => (registering = false)}
  />
{:else}
  <LoginPage
    api={runtime.api}
    onLoggedIn={signedIn}
    onRegister={() => (registering = true)}
  />
{/if}
