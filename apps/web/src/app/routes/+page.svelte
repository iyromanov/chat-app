<script lang="ts">
  import { onMount } from 'svelte';
  import type { CurrentUser } from '@chat/contracts';
  import { LoginPage } from '@pages/login';
  import { RegisterPage } from '@pages/register';
  import {
    Alert,
    Button,
    Card,
    Heading,
    Helper,
    P,
    Spinner,
  } from 'flowbite-svelte';
  import { createAuth } from '../auth';
  const auth = createAuth();
  let registering = $state(false);
  let logoutError = $state('');
  function signedIn(user: CurrentUser) {
    registering = false;
    auth.registered(user);
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
    void auth.restore();
    return auth.dispose;
  });
</script>

<svelte:window onstorage={auth.storageChanged} />
<svelte:document onvisibilitychange={auth.visibilityChanged} />

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
{:else if auth.state.status === 'authenticated'}
  <main class="mx-auto max-w-3xl p-6 sm:p-12">
    <Card size="xl" class="gap-4 p-6">
      <Helper>Private area</Helper>
      <Heading tag="h1" class="text-3xl"
        >Welcome, {auth.state.user.username}!</Heading
      >
      <P>You are signed in. Your conversations will appear here.</P>
      {#if logoutError}<Alert color="red" role="alert">{logoutError}</Alert
        >{/if}
      <Button onclick={logout}>Sign out</Button>
    </Card>
  </main>
{:else if registering}
  <RegisterPage
    api={auth.api}
    onRegistered={signedIn}
    onSignIn={() => (registering = false)}
  />
{:else}
  <LoginPage
    api={auth.api}
    onLoggedIn={signedIn}
    onRegister={() => (registering = true)}
  />
{/if}
