import { body, param } from "express-validator";
import { validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";

const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

export const validateInvoice = [
  body("customer_name").trim().notEmpty().withMessage("customer_name is required"),
  body("customer_email").isEmail().withMessage("Invalid customer email"),
  body("line_items")
    .isArray({ min: 1 })
    .withMessage("At least one line item is required"),
  body("line_items.*.description")
    .trim()
    .notEmpty()
    .withMessage("Each line item must have a description"),
  body("line_items.*.quantity")
    .isFloat({ gt: 0 })
    .withMessage("Quantity must be greater than 0"),
  body("line_items.*.unit_price")
    .isFloat({ gt: 0 })
    .withMessage("Unit price must be greater than 0"),
  body("currency").trim().notEmpty().withMessage("currency is required"),
  body("due_date").isISO8601().withMessage("due_date must be a valid date (YYYY-MM-DD)"),
  body("notes").optional().isString(),
  validate,
];

export const validateStatusUpdate = [
  param("id").notEmpty().withMessage("Invoice ID is required"),
  body("status")
    .isIn(["unpaid", "pending", "paid", "overdue"])
    .withMessage("status must be one of: unpaid, pending, paid, overdue"),
  validate,
];
