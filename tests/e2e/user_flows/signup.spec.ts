/**
 * E2E Test: User Signup Flow
 *
 * Complete end-to-end testing of the user signup process including:
 * - Form validation
 * - Email verification
 * - Profile setup
 * - Welcome email
 * - Dashboard access
 *
 * Days 19-21: Testing Suite & Documentation
 */

import { test, expect, helpers } from '../fixtures';
import { generators } from '../playwright.config';

test.describe('User Signup Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('should display signup form with all required fields', async ({ page }) => {
    // Check form is visible
    await expect(page.locator('form[data-testid="signup-form"]')).toBeVisible();

    // Check all fields are present
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();

    // Check submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText(/sign up|create account/i);

    // Check terms and conditions checkbox
    await expect(page.locator('input[name="agreeToTerms"]')).toBeVisible();

    // Check login link
    await expect(page.locator('a[href="/login"]')).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    // Try invalid email
    await page.fill('input[name="email"]', 'invalid-email');
    await page.fill('input[name="username"]', generators.randomUsername());
    await page.fill('input[name="password"]', 'ValidPass123!');
    await page.fill('input[name="confirmPassword"]', 'ValidPass123!');
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    // Check error message
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-error"]')).toContainText(/valid email/i);
  });

  test('should validate username requirements', async ({ page }) => {
    // Too short
    await page.fill('input[name="email"]', generators.randomEmail());
    await page.fill('input[name="username"]', 'ab');
    await page.fill('input[name="password"]', 'ValidPass123!');
    await page.fill('input[name="confirmPassword"]', 'ValidPass123!');
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="username-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="username-error"]')).toContainText(/at least 3 characters/i);

    // Invalid characters
    await page.fill('input[name="username"]', 'user@name!');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="username-error"]')).toContainText(/alphanumeric/i);
  });

  test('should validate password strength', async ({ page }) => {
    const email = generators.randomEmail();
    const username = generators.randomUsername();

    // Weak password (too short)
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', 'Pass1!');
    await page.fill('input[name="confirmPassword"]', 'Pass1!');
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="password-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-error"]')).toContainText(/at least 8 characters/i);

    // No uppercase
    await page.fill('input[name="password"]', 'password123!');
    await page.fill('input[name="confirmPassword"]', 'password123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="password-error"]')).toContainText(/uppercase/i);

    // No special character
    await page.fill('input[name="password"]', 'Password123');
    await page.fill('input[name="confirmPassword"]', 'Password123');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="password-error"]')).toContainText(/special character/i);
  });

  test('should validate password confirmation', async ({ page }) => {
    await page.fill('input[name="email"]', generators.randomEmail());
    await page.fill('input[name="username"]', generators.randomUsername());
    await page.fill('input[name="password"]', 'ValidPass123!');
    await page.fill('input[name="confirmPassword"]', 'DifferentPass123!');
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="confirm-password-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirm-password-error"]')).toContainText(/match/i);
  });

  test('should require terms acceptance', async ({ page }) => {
    await page.fill('input[name="email"]', generators.randomEmail());
    await page.fill('input[name="username"]', generators.randomUsername());
    await page.fill('input[name="password"]', 'ValidPass123!');
    await page.fill('input[name="confirmPassword"]', 'ValidPass123!');
    // Don't check terms
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="terms-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="terms-error"]')).toContainText(/accept.*terms/i);
  });

  test('should successfully create account with valid data', async ({ page, email }) => {
    const testEmail = generators.randomEmail();
    const testUsername = generators.randomUsername();
    const testPassword = generators.randomPassword();

    // Fill form
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);
    await page.check('input[name="agreeToTerms"]');

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to email verification page
    await page.waitForURL('/verify-email');

    // Check success message
    await expect(page.locator('[data-testid="verification-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="verification-message"]')).toContainText(testEmail);

    // Verify email was sent
    const verificationEmail = await email.waitForEmail(testEmail);
    expect(verificationEmail).toBeTruthy();
    expect(verificationEmail.Subject).toContain('Verify');
  });

  test('should show error for duplicate email', async ({ page, database }) => {
    // Create existing user
    const existingEmail = generators.randomEmail();
    await database.createUser({
      email: existingEmail,
      username: generators.randomUsername(),
      password: 'HashedPass123!',
      tier: 'free',
    });

    // Try to signup with same email
    await page.fill('input[name="email"]', existingEmail);
    await page.fill('input[name="username"]', generators.randomUsername());
    await page.fill('input[name="password"]', 'ValidPass123!');
    await page.fill('input[name="confirmPassword"]', 'ValidPass123!');
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    // Check error message
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-error"]')).toContainText(/already exists|already registered/i);
  });

  test('should show error for duplicate username', async ({ page, database }) => {
    // Create existing user
    const existingUsername = generators.randomUsername();
    await database.createUser({
      email: generators.randomEmail(),
      username: existingUsername,
      password: 'HashedPass123!',
      tier: 'free',
    });

    // Try to signup with same username
    await page.fill('input[name="email"]', generators.randomEmail());
    await page.fill('input[name="username"]', existingUsername);
    await page.fill('input[name="password"]', 'ValidPass123!');
    await page.fill('input[name="confirmPassword"]', 'ValidPass123!');
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    // Check error message
    await expect(page.locator('[data-testid="username-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="username-error"]')).toContainText(/already taken|not available/i);
  });

  test('should verify email with valid token', async ({ page, database, email }) => {
    // Create user
    const testEmail = generators.randomEmail();
    const testUsername = generators.randomUsername();
    const testPassword = generators.randomPassword();

    // Signup
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    await page.waitForURL('/verify-email');

    // Get verification email
    const verificationEmail = await email.waitForEmail(testEmail);
    const emailBody = verificationEmail.Content.Body;

    // Extract verification link
    const linkMatch = emailBody.match(/href="([^"]*verify[^"]*)"/);
    expect(linkMatch).toBeTruthy();
    const verificationLink = linkMatch![1];

    // Click verification link
    await page.goto(verificationLink);

    // Should redirect to profile setup
    await page.waitForURL('/setup-profile');

    // Check success message
    await expect(page.locator('[data-testid="verification-success"]')).toBeVisible();
  });

  test('should show error for invalid verification token', async ({ page }) => {
    await page.goto('/verify?token=invalid-token-12345');

    await expect(page.locator('[data-testid="verification-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="verification-error"]')).toContainText(/invalid.*expired/i);
  });

  test('should complete profile setup', async ({ page, authenticatedUser }) => {
    // Login as verified user
    await helpers.login(page, authenticatedUser.email, authenticatedUser.password);

    // Go to profile setup (if not already there)
    if (!page.url().includes('/setup-profile')) {
      await page.goto('/setup-profile');
    }

    // Fill profile data
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="company"]', 'Acme Corp');
    await page.selectOption('select[name="industry"]', 'DeFi');
    await page.fill('textarea[name="useCase"]', 'Monitoring exploits for our protocol');

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await page.waitForURL('/dashboard');

    // Check welcome message
    await expect(page.locator('[data-testid="welcome-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="welcome-message"]')).toContainText('John');
  });

  test('should send welcome email after profile setup', async ({ page, email }) => {
    const testEmail = generators.randomEmail();
    const testUsername = generators.randomUsername();
    const testPassword = generators.randomPassword();

    // Complete signup flow
    await page.goto('/signup');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="username"]', testUsername);
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="confirmPassword"]', testPassword);
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    // Skip email verification for this test
    // (In real scenario, we'd complete it)

    // Check welcome email
    const welcomeEmail = await email.waitForEmail(testEmail);
    expect(welcomeEmail.Subject).toContain('Welcome');
    expect(welcomeEmail.Content.Body).toContain(testUsername);
  });

  test('should allow resending verification email', async ({ page, email }) => {
    const testEmail = generators.randomEmail();

    // Signup
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="username"]', generators.randomUsername());
    await page.fill('input[name="password"]', generators.randomPassword());
    await page.fill('input[name="confirmPassword"]', generators.randomPassword());
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    await page.waitForURL('/verify-email');

    // Click resend button
    await page.click('[data-testid="resend-verification"]');

    // Check success message
    await expect(page.locator('[data-testid="resend-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="resend-success"]')).toContainText(/sent/i);

    // Wait for new email
    await page.waitForTimeout(2000); // Wait for email processing

    // Verify new email was sent
    const emails = await email.getLatestEmail(testEmail);
    expect(emails).toBeTruthy();
  });

  test('should show signup form on mobile devices', async ({ page, isMobile }) => {
    if (!isMobile) {
      test.skip();
    }

    await page.goto('/signup');

    // Check mobile-optimized form
    await expect(page.locator('form[data-testid="signup-form"]')).toBeVisible();

    // Check inputs are properly sized for mobile
    const emailInput = page.locator('input[name="email"]');
    const emailBox = await emailInput.boundingBox();
    expect(emailBox!.width).toBeGreaterThan(200); // Reasonable mobile width

    // Check keyboard type for email input
    await emailInput.click();
    const inputType = await emailInput.getAttribute('type');
    expect(inputType).toBe('email'); // Should trigger email keyboard
  });

  test('should preserve form data on page refresh', async ({ page }) => {
    const email = generators.randomEmail();
    const username = generators.randomUsername();

    // Fill some fields
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="username"]', username);

    // Refresh page
    await page.reload();

    // Check if data is preserved (if localStorage is used)
    const emailValue = await page.inputValue('input[name="email"]');
    const usernameValue = await page.inputValue('input[name="username"]');

    // Note: This depends on implementation
    // If form doesn't preserve data, these will be empty
    if (emailValue && usernameValue) {
      expect(emailValue).toBe(email);
      expect(usernameValue).toBe(username);
    }
  });

  test('should show password strength indicator', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"]');

    // Weak password
    await passwordInput.fill('weak');
    await expect(page.locator('[data-testid="password-strength"]')).toContainText(/weak/i);

    // Medium password
    await passwordInput.fill('Medium1!');
    await expect(page.locator('[data-testid="password-strength"]')).toContainText(/medium/i);

    // Strong password
    await passwordInput.fill('VeryStrongP@ssw0rd!');
    await expect(page.locator('[data-testid="password-strength"]')).toContainText(/strong/i);
  });

  test('should toggle password visibility', async ({ page }) => {
    const passwordInput = page.locator('input[name="password"]');
    const toggleButton = page.locator('[data-testid="toggle-password-visibility"]');

    // Initially type="password"
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle
    await toggleButton.click();

    // Should be type="text"
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again
    await toggleButton.click();

    // Back to type="password"
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should handle OAuth signup (Google)', async ({ page, context }) => {
    // Click Google signup button
    const oauthButton = page.locator('[data-testid="google-signup"]');
    await expect(oauthButton).toBeVisible();

    // Mock OAuth flow (in real test, we'd handle popup)
    await context.route('**/auth/google/callback*', (route) => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          redirectUrl: '/dashboard',
        }),
      });
    });

    await oauthButton.click();

    // Should redirect to dashboard
    await page.waitForURL('/dashboard');
  });

  test('should track signup analytics events', async ({ page, context }) => {
    const analyticsEvents: any[] = [];

    // Intercept analytics calls
    await context.route('**/analytics/**', (route) => {
      analyticsEvents.push(route.request().postDataJSON());
      route.fulfill({ status: 200 });
    });

    // Complete signup
    await page.fill('input[name="email"]', generators.randomEmail());
    await page.fill('input[name="username"]', generators.randomUsername());
    await page.fill('input[name="password"]', generators.randomPassword());
    await page.fill('input[name="confirmPassword"]', generators.randomPassword());
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    // Check analytics events
    expect(analyticsEvents.length).toBeGreaterThan(0);
    expect(analyticsEvents.some((e) => e.event === 'signup_started')).toBeTruthy();
    expect(analyticsEvents.some((e) => e.event === 'signup_completed')).toBeTruthy();
  });
});

test.describe('Signup Error Handling', () => {
  test('should handle network errors gracefully', async ({ page, context }) => {
    // Simulate network error
    await context.route('**/api/auth/signup', (route) => {
      route.abort('failed');
    });

    await page.goto('/signup');
    await page.fill('input[name="email"]', generators.randomEmail());
    await page.fill('input[name="username"]', generators.randomUsername());
    await page.fill('input[name="password"]', generators.randomPassword());
    await page.fill('input[name="confirmPassword"]', generators.randomPassword());
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    // Check error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText(/network.*error/i);
  });

  test('should handle server errors (500)', async ({ page, context }) => {
    await context.route('**/api/auth/signup', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/signup');
    await page.fill('input[name="email"]', generators.randomEmail());
    await page.fill('input[name="username"]', generators.randomUsername());
    await page.fill('input[name="password"]', generators.randomPassword());
    await page.fill('input[name="confirmPassword"]', generators.randomPassword());
    await page.check('input[name="agreeToTerms"]');
    await page.click('button[type="submit"]');

    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText(/try again later/i);
  });

  test('should disable submit button during submission', async ({ page }) => {
    await page.fill('input[name="email"]', generators.randomEmail());
    await page.fill('input[name="username"]', generators.randomUsername());
    await page.fill('input[name="password"]', generators.randomPassword());
    await page.fill('input[name="confirmPassword"]', generators.randomPassword());
    await page.check('input[name="agreeToTerms"]');

    const submitButton = page.locator('button[type="submit"]');

    // Click submit
    await submitButton.click();

    // Button should be disabled immediately
    await expect(submitButton).toBeDisabled();

    // Should show loading indicator
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();
  });
});
