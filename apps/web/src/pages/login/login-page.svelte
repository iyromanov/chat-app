<script lang="ts">
  import type { Login } from '@chat/contracts/auth';
  import { LoginForm } from '@features/login';
  import { Button, Card, Heading, P } from 'flowbite-svelte';
  let {
    onLogin,
    onCreateAccount,
  }: {
    onLogin: (input: Login) => Promise<void>;
    onCreateAccount: () => void;
  } = $props();
</script>

<main class="grid min-h-dvh place-items-center p-6">
  <Card size="md" class="w-full max-w-md gap-6 p-6">
    <Heading tag="h1" class="text-3xl">Sign in</Heading>
    <P>Welcome back to Chat.</P>
    <LoginForm {onLogin} />
    <Button color="alternative" onclick={onCreateAccount}
      >Create an account</Button
    >
  </Card>
</main>
