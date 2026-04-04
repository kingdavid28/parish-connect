// Validation result type
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// Individual validator type
export type Validator<T> = (value: T) => string | null;

// Common validators
export const validators = {
  required: (fieldName = "This field"): Validator<unknown> => {
    return (value: unknown) => {
      if (value === null || value === undefined || value === "") {
        return `${fieldName} is required`;
      }
      if (typeof value === "string" && value.trim() === "") {
        return `${fieldName} cannot be empty`;
      }
      return null;
    };
  },

  email: (value: string): string | null => {
    if (!value) return null; // Use 'required' validator separately
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) ? null : "Please enter a valid email address";
  },

  minLength: (min: number): Validator<string> => {
    return (value: string) => {
      if (!value) return null;
      return value.length >= min
        ? null
        : `Must be at least ${min} characters long`;
    };
  },

  maxLength: (max: number): Validator<string> => {
    return (value: string) => {
      if (!value) return null;
      return value.length <= max
        ? null
        : `Must be no more than ${max} characters long`;
    };
  },

  pattern: (regex: RegExp, message: string): Validator<string> => {
    return (value: string) => {
      if (!value) return null;
      return regex.test(value) ? null : message;
    };
  },

  phone: (value: string): string | null => {
    if (!value) return null;
    const phoneRegex = /^[\d\s()+-]+$/;
    return phoneRegex.test(value) ? null : "Please enter a valid phone number";
  },

  url: (value: string): string | null => {
    if (!value) return null;
    try {
      new URL(value);
      return null;
    } catch {
      return "Please enter a valid URL";
    }
  },

  date: (value: string): string | null => {
    if (!value) return null;
    const date = new Date(value);
    return !isNaN(date.getTime()) ? null : "Please enter a valid date";
  },

  pastDate: (value: string): string | null => {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return "Please enter a valid date";
    return date < new Date() ? null : "Date must be in the past";
  },

  futureDate: (value: string): string | null => {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return "Please enter a valid date";
    return date > new Date() ? null : "Date must be in the future";
  },

  number: (value: unknown): string | null => {
    if (value === null || value === undefined || value === "") return null;
    return !isNaN(Number(value)) ? null : "Must be a valid number";
  },

  min: (min: number): Validator<number> => {
    return (value: number) => {
      if (value === null || value === undefined) return null;
      return value >= min ? null : `Must be at least ${min}`;
    };
  },

  max: (max: number): Validator<number> => {
    return (value: number) => {
      if (value === null || value === undefined) return null;
      return value <= max ? null : `Must be no more than ${max}`;
    };
  },

  match: (otherValue: unknown, otherFieldName = "field"): Validator<unknown> => {
    return (value: unknown) => {
      return value === otherValue ? null : `Must match ${otherFieldName}`;
    };
  },

  oneOf: (allowedValues: unknown[], fieldName = "value"): Validator<unknown> => {
    return (value: unknown) => {
      return allowedValues.includes(value)
        ? null
        : `${fieldName} must be one of: ${allowedValues.join(", ")}`;
    };
  },
};

// Validate a single field with multiple validators
export function validateField<T>(
  value: T,
  validatorList: Validator<T>[]
): string | null {
  for (const validator of validatorList) {
    const error = validator(value);
    if (error) return error;
  }
  return null;
}

// Validate an entire form
export function validateForm<T extends Record<string, unknown>>(
  values: T,
  rules: Record<keyof T, Validator<unknown>[]>
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const field of Object.keys(rules) as Array<keyof T>) {
    const value = values[field];
    const fieldValidators = rules[field as string];
    const error = validateField(value, fieldValidators);
    if (error) {
      errors[field as string] = error;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Custom validation hook for React Hook Form
export function createValidationRules<T>(
  validatorList: Validator<T>[]
): {
  validate: (value: T) => string | true;
} {
  return {
    validate: (value: T) => {
      const error = validateField(value, validatorList);
      return error || true;
    },
  };
}

// Sanitize input to prevent XSS
export function sanitizeInput(input: string): string {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

// Sanitize HTML (basic - use DOMPurify for production)
export function sanitizeHtml(html: string): string {
  const allowedTags = ["b", "i", "em", "strong", "a", "p", "br"];
  const div = document.createElement("div");
  div.innerHTML = html;

  // Remove script tags
  const scripts = div.querySelectorAll("script");
  scripts.forEach((script) => script.remove());

  // Remove event handlers
  const allElements = div.querySelectorAll("*");
  allElements.forEach((element) => {
    const attrs = Array.from(element.attributes);
    attrs.forEach((attr) => {
      if (attr.name.startsWith("on")) {
        element.removeAttribute(attr.name);
      }
    });

    // Remove non-allowed tags
    if (!allowedTags.includes(element.tagName.toLowerCase())) {
      element.remove();
    }
  });

  return div.innerHTML;
}

// Debounce validation (for real-time validation)
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Common form validation schemas
export const commonValidationSchemas = {
  login: {
    email: [validators.required("Email"), validators.email],
    password: [validators.required("Password"), validators.minLength(6)],
  },

  createUser: {
    name: [validators.required("Name"), validators.minLength(2), validators.maxLength(100)],
    email: [validators.required("Email"), validators.email],
    role: [validators.required("Role"), validators.oneOf(["admin", "parishioner"], "Role")],
  },

  updateProfile: {
    name: [validators.required("Name"), validators.minLength(2), validators.maxLength(100)],
    email: [validators.required("Email"), validators.email],
    phone: [validators.phone],
    bio: [validators.maxLength(500)],
  },

  baptismalRecord: {
    childName: [validators.required("Child's name"), validators.minLength(2)],
    baptismDate: [validators.required("Baptism date"), validators.date, validators.pastDate],
    birthDate: [validators.required("Birth date"), validators.date, validators.pastDate],
    fatherName: [validators.required("Father's name")],
    motherName: [validators.required("Mother's name")],
    godparent1: [validators.required("Godparent name")],
    minister: [validators.required("Minister name")],
  },
};
