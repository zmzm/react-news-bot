# OpenAI Integration Security

This document outlines the security measures implemented for the OpenAI API integration.

## Security Features Implemented

### 1. API Key Management

**✅ Enhanced Validation (`config/env.js`)**

- Validates API key format (must start with `sk-`)
- Validates minimum length (20 characters)
- Validates maximum length (200 characters)
- Warns if key appears shorter than expected
- Exits with error if validation fails (prevents runtime errors)

**✅ API Key Protection**

- API key never logged in plaintext
- All error messages sanitized to remove API keys
- API key only stored in environment variables
- Never exposed in error responses to users

### 2. Input Validation & Sanitization

**✅ Prompt Validation (`utils/openaiSecurity.js`)**

- Maximum prompt length: 50,000 characters (~12,500 tokens)
- Maximum system prompt length: 2,000 characters (~500 tokens)
- Content sanitization removes control characters
- Prevents prompt injection attacks

**✅ Content Sanitization**

- Removes null bytes and control characters
- Limits excessive whitespace
- Truncates content at safe boundaries
- Per-article limit: 10,000 characters
- Total content limit: 100,000 characters

### 3. Model Security

**✅ Model Allowlist (`config/constants.js`)**

- Only allows approved models:
  - `gpt-4.1`
  - `gpt-4.1-mini`
  - `gpt-4.1-nano`
  - `o4-mini`
- Prevents model injection attacks
- Default model: `gpt-4.1-mini`

### 4. Token Limits & Cost Controls

**✅ Token Limits (`config/constants.js`)**

- Default max tokens: 2,000
- Digest max tokens: 4,000
- Absolute maximum: 8,000 tokens
- Prevents excessive API costs
- All token values validated and clamped

**✅ Temperature Limits**

- Minimum: 0.0
- Maximum: 2.0
- Default: 0.7
- Prevents invalid values

### 5. Error Handling

**✅ Secure Error Messages**

- API keys sanitized from all error messages
- Generic error messages for users
- Detailed errors only logged server-side
- Stack traces only in development mode
- No sensitive information exposed

**✅ Error Types Handled**

- 401: Invalid API key (generic message)
- 429: Rate limit exceeded
- 500+: Service unavailable
- Network errors: Generic messages

### 6. Logging Security

**✅ Sanitized Logging (`utils/logger.js`)**

- All log messages sanitized for API keys
- URLs truncated in logs (max 100 chars)
- Error objects sanitized before logging
- Stack traces only in development

### 7. Request Security

**✅ Request Validation**

- All prompts validated before API calls
- Model names validated against allowlist
- Token limits enforced
- Temperature values clamped
- Content sanitized before sending

## Security Constants

Located in `config/constants.js`:

```javascript
OPENAI: {
  ALLOWED_MODELS: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o4-mini"],
  DEFAULT_MODEL: "gpt-4.1-mini",
  MAX_TOKENS: {
    DEFAULT: 2000,
    DIGEST: 4000,
    MAX_ABSOLUTE: 8000,
  },
  MAX_PROMPT_LENGTH: 50000,
  MAX_SYSTEM_PROMPT_LENGTH: 2000,
  MAX_ARTICLE_CONTENT_LENGTH: 10000,
  MAX_TOTAL_CONTENT_LENGTH: 100000,
  MIN_TEMPERATURE: 0.0,
  MAX_TEMPERATURE: 2.0,
}
```

## Security Utilities

Located in `utils/openaiSecurity.js`:

- `sanitizeApiKey()` - Removes API keys from strings
- `validateModel()` - Validates model against allowlist
- `validateMaxTokens()` - Validates and clamps token limits
- `validateTemperature()` - Validates and clamps temperature
- `validatePromptLength()` - Validates prompt length
- `validateSystemPromptLength()` - Validates system prompt length
- `sanitizeContent()` - Sanitizes content for injection prevention
- `truncateContent()` - Safely truncates content at boundaries

## Best Practices Followed

1. **Defense in Depth**: Multiple layers of validation
2. **Principle of Least Privilege**: Only necessary models allowed
3. **Input Validation**: All inputs validated before use
4. **Output Sanitization**: All outputs sanitized before logging
5. **Error Handling**: Generic errors for users, detailed logs server-side
6. **Cost Controls**: Hard limits on tokens to prevent excessive costs
7. **Prompt Injection Prevention**: Content sanitization and length limits

## Security Checklist

- [x] API key validation on startup
- [x] API key never logged
- [x] Model allowlist enforced
- [x] Token limits enforced
- [x] Input validation for all prompts
- [x] Content sanitization
- [x] Error message sanitization
- [x] Cost controls (token limits)
- [x] Rate limiting (via middleware)
- [x] Secure error handling

## Testing Security

To verify security measures:

```bash
# Test API key validation
OPENAI_API_KEY=invalid_key bun start  # Should exit with error

# Test model validation (should fail)
# Try to use unauthorized model in code

# Test token limits (should clamp)
# Try to request more than MAX_ABSOLUTE tokens
```

## Future Enhancements

Potential additional security measures:

1. **API Key Rotation**: Support for key rotation
2. **Usage Monitoring**: Track API usage and costs
3. **Request Signing**: Add request signing for additional security
4. **IP Whitelisting**: If OpenAI supports it
5. **Content Filtering**: Additional content filtering before API calls
