import fs from "node:fs";
import path from "node:path";

function paginatedResponse(schemaRef: string, exampleItem: any) {
  return {
    200: {
      description: "Paginated list result",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              success: { type: "boolean", example: true },
              data: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: { type: "object" },
                    example: [exampleItem],
                  },
                  pagination: { $ref: "#/components/schemas/PaginationMeta" },
                },
              },
            },
          },
        },
      },
    },
    401: { $ref: "#/components/responses/Unauthorized" },
  };
}

function singleResponse(propName: string, exampleData: any, status = 200, message?: string) {
  return {
    [status]: {
      description: "Successful operation",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              success: { type: "boolean", example: true },
              ...(message ? { message: { type: "string", example: message } } : {}),
              data: {
                type: "object",
                properties: {
                  [propName]: { type: "object", example: exampleData },
                },
              },
            },
          },
        },
      },
    },
    400: { $ref: "#/components/responses/BadRequest" },
    401: { $ref: "#/components/responses/Unauthorized" },
    404: { $ref: "#/components/responses/NotFound" },
  };
}

function standardListParams(extraParams: any[] = []) {
  return [
    { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
    { name: "limit", in: "query", schema: { type: "integer", default: 10 }, description: "Items per page (max 100)" },
    { name: "search", in: "query", schema: { type: "string" }, description: "Keyword search" },
    { name: "sort_by", in: "query", schema: { type: "string", default: "createdAt" }, description: "Field to sort by" },
    { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" }, description: "Sort direction" },
    { name: "status", in: "query", schema: { type: "boolean" }, description: "Filter by active status (true/false)" },
    ...extraParams,
  ];
}

function idParam() {
  return [
    {
      name: "id",
      in: "path",
      required: true,
      schema: { type: "string", example: "6ae2e6e0a8448da0f3c60dc0" },
      description: "MongoDB ObjectId of the resource",
    },
  ];
}

function jsonBody(example: any, description = "Request Payload") {
  return {
    description,
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          example,
        },
      },
    },
  };
}

function multipartBody(field = "image", description = "Upload file (multipart/form-data)") {
  return {
    description,
    required: true,
    content: {
      "multipart/form-data": {
        schema: {
          type: "object",
          properties: {
            [field]: {
              type: "string",
              format: "binary",
              description: "Image file (.png, .jpg, .jpeg, .webp, max 5MB)",
            },
          },
          required: [field],
        },
      },
    },
  };
}

export function buildOpenApiSpec() {
  const paths: Record<string, any> = {};

  // ==========================================
  // Health
  // ==========================================
  paths["/health"] = {
    get: {
      tags: ["General"],
      summary: "Health Check",
      description: "Checks server status, uptime, and database connectivity",
      responses: {
        200: {
          description: "Server is healthy",
          content: {
            "application/json": {
              example: {
                success: true,
                message: "OK",
                data: {
                  status: "ok",
                  timestamp: "2026-10-29T09:30:00.000Z",
                  uptime: 124.5,
                  database: "connected",
                },
              },
            },
          },
        },
      },
    },
  };

  // ==========================================
  // [Super Admin] Auth
  // ==========================================
  paths["/api/auth/login"] = {
    post: {
      tags: ["Super Admin - Auth"],
      summary: "Super Admin Login",
      description: "Authenticates super admin and returns Bearer JWT token",
      requestBody: jsonBody({
        email: "admin@scouting.local",
        password: "Admin@123456",
      }),
      responses: {
        200: {
          description: "Login successful",
          content: {
            "application/json": {
              example: {
                success: true,
                message: "Login successful",
                data: {
                  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                  admin: {
                    id: "6ae2e6e0a8448da0f3c60dc0",
                    name: "Super Admin",
                    email: "admin@scouting.local",
                    role: "super_admin",
                  },
                },
              },
            },
          },
        },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  };

  paths["/api/auth/me"] = {
    get: {
      tags: ["Super Admin - Auth"],
      summary: "Get Current Super Admin Profile",
      security: [{ SuperAdminAuth: [] }],
      responses: singleResponse("admin", {
        id: "6ae2e6e0a8448da0f3c60dc0",
        name: "Super Admin",
        email: "admin@scouting.local",
        role: "super_admin",
      }),
    },
  };

  paths["/api/auth/change-password"] = {
    put: {
      tags: ["Super Admin - Auth"],
      summary: "Change Super Admin Password",
      security: [{ SuperAdminAuth: [] }],
      requestBody: jsonBody({
        current_password: "Admin@123456",
        new_password: "NewAdmin@123456",
      }),
      responses: singleResponse("admin", {
        id: "6ae2e6e0a8448da0f3c60dc0",
        email: "admin@scouting.local",
      }, 200, "Password changed successfully"),
    },
  };

  // ==========================================
  // [Super Admin] Dashboard
  // ==========================================
  paths["/api/dashboard"] = {
    get: {
      tags: ["Super Admin - Dashboard"],
      summary: "Get Platform Dashboard Analytics",
      description: "Returns platform wide stats, active clubs, subscription statuses, orders, and revenue chart",
      security: [{ SuperAdminAuth: [] }],
      parameters: [
        {
          name: "months",
          in: "query",
          schema: { type: "integer", default: 12 },
          description: "Number of months for revenue breakdown (1-24)",
        },
      ],
      responses: {
        200: {
          description: "Dashboard stats",
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  counts: {
                    games: 4,
                    actions: 28,
                    packages: 6,
                    clubs: 15,
                    orders: 42,
                    paid_orders: 35,
                  },
                  revenue: {
                    total: 245000,
                    this_month: 28500,
                    currency: "EGP",
                  },
                  subscriptions: {
                    active: 10,
                    grace: 2,
                    expired: 2,
                    pending: 1,
                    inactive: 0,
                  },
                  monthly_revenue: [
                    { month: "2026-08", total: 18000, count: 3 },
                    { month: "2026-09", total: 22000, count: 4 },
                    { month: "2026-10", total: 28500, count: 5 },
                  ],
                  recent_orders: [
                    {
                      _id: "6ae2e88d1540b80d32644b80",
                      order_number: "ORD-2026-000015",
                      club: { name: "Al Ahly SC", subdomain: "ahly" },
                      final_price: 15000,
                      status: "paid",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  };

  // ==========================================
  // [Super Admin] Games
  // ==========================================
  paths["/api/games"] = {
    get: {
      tags: ["Super Admin - Games"],
      summary: "List Games",
      security: [{ SuperAdminAuth: [] }],
      parameters: standardListParams(),
      responses: paginatedResponse("Game", {
        _id: "6ae2e6e0a8448da0f3c60dc0",
        name: "Football",
        status: true,
        createdAt: "2026-10-01T10:00:00.000Z",
      }),
    },
    post: {
      tags: ["Super Admin - Games"],
      summary: "Create Game",
      security: [{ SuperAdminAuth: [] }],
      requestBody: jsonBody({ name: "Basketball", status: true }),
      responses: singleResponse("game", {
        _id: "6ae2e6e0a8448da0f3c60dc1",
        name: "Basketball",
        status: true,
      }, 201, "Game created successfully"),
    },
  };

  paths["/api/games/select"] = {
    get: {
      tags: ["Super Admin - Games"],
      summary: "Select Games (Dropdown)",
      description: "Returns lightweight active games array for dropdowns",
      security: [{ SuperAdminAuth: [] }],
      responses: {
        200: {
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  games: [
                    { _id: "6ae2e6e0a8448da0f3c60dc0", name: "Football" },
                    { _id: "6ae2e6e0a8448da0f3c60dc1", name: "Basketball" },
                  ],
                },
              },
            },
          },
        },
      },
    },
  };

  paths["/api/games/{id}"] = {
    get: {
      tags: ["Super Admin - Games"],
      summary: "Get Game by ID",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      responses: singleResponse("game", { _id: "6ae2e6e0a8448da0f3c60dc0", name: "Football", status: true }),
    },
    put: {
      tags: ["Super Admin - Games"],
      summary: "Update Game",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      requestBody: jsonBody({ name: "Football Pro", status: true }),
      responses: singleResponse("game", { _id: "6ae2e6e0a8448da0f3c60dc0", name: "Football Pro", status: true }),
    },
    delete: {
      tags: ["Super Admin - Games"],
      summary: "Delete Game",
      description: "Deletes the game and its catalog actions/packages. Fails with 409 if clubs are subscribed unless `?force=true`.",
      security: [{ SuperAdminAuth: [] }],
      parameters: [
        ...idParam(),
        { name: "force", in: "query", schema: { type: "boolean" }, description: "Cascade delete clubs that use this game's packages" },
      ],
      responses: singleResponse("id", "6ae2e6e0a8448da0f3c60dc0", 200, "Game deleted successfully"),
    },
  };

  paths["/api/games/bulk-delete"] = {
    post: {
      tags: ["Super Admin - Games"],
      summary: "Bulk Delete Games",
      security: [{ SuperAdminAuth: [] }],
      requestBody: jsonBody({ ids: ["6ae2e6e0a8448da0f3c60dc0", "6ae2e6e0a8448da0f3c60dc1"] }),
      responses: {
        200: {
          content: {
            "application/json": {
              example: {
                success: true,
                message: "2 game(s) deleted successfully",
                data: { deletedCount: 2 },
              },
            },
          },
        },
      },
    },
  };

  // ==========================================
  // [Super Admin] Actions
  // ==========================================
  paths["/api/actions"] = {
    get: {
      tags: ["Super Admin - Actions"],
      summary: "List Actions",
      security: [{ SuperAdminAuth: [] }],
      parameters: standardListParams([
        { name: "game_id", in: "query", schema: { type: "string" }, description: "Filter actions by game ID" },
      ]),
      responses: paginatedResponse("Action", {
        _id: "6ae2e6e0a8448da0f3c60dc5",
        name: "Goal",
        game_id: { _id: "6ae2e6e0a8448da0f3c60dc0", name: "Football" },
        status: true,
      }),
    },
    post: {
      tags: ["Super Admin - Actions"],
      summary: "Create Action",
      security: [{ SuperAdminAuth: [] }],
      requestBody: jsonBody({
        name: "Assist",
        game_id: "6ae2e6e0a8448da0f3c60dc0",
        status: true,
      }),
      responses: singleResponse("action", {
        _id: "6ae2e6e0a8448da0f3c60dc6",
        name: "Assist",
        game_id: "6ae2e6e0a8448da0f3c60dc0",
        status: true,
      }, 201, "Action created successfully"),
    },
  };

  paths["/api/actions/{id}"] = {
    get: {
      tags: ["Super Admin - Actions"],
      summary: "Get Action by ID",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      responses: singleResponse("action", { _id: "6ae2e6e0a8448da0f3c60dc5", name: "Goal", status: true }),
    },
    put: {
      tags: ["Super Admin - Actions"],
      summary: "Update Action",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      requestBody: jsonBody({ name: "Penalty Goal", status: true }),
      responses: singleResponse("action", { _id: "6ae2e6e0a8448da0f3c60dc5", name: "Penalty Goal", status: true }),
    },
    delete: {
      tags: ["Super Admin - Actions"],
      summary: "Delete Action",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      responses: singleResponse("id", "6ae2e6e0a8448da0f3c60dc5", 200, "Action deleted successfully"),
    },
  };

  // ==========================================
  // [Super Admin] Packages
  // ==========================================
  paths["/api/packages"] = {
    get: {
      tags: ["Super Admin - Packages"],
      summary: "List Packages",
      security: [{ SuperAdminAuth: [] }],
      parameters: standardListParams([
        { name: "game_id", in: "query", schema: { type: "string" }, description: "Filter by game ID" },
      ]),
      responses: paginatedResponse("Package", {
        _id: "6ae2e6e0a8448da0f3c60dd0",
        name: "Pro Club Package",
        game_id: { _id: "6ae2e6e0a8448da0f3c60dc0", name: "Football" },
        teams: 5,
        players: 30,
        status: true,
        cycles: [
          {
            _id: "6ae2e6e0a8448da0f3c60dd1",
            name: "Quarterly (3 Months)",
            months: 3,
            price: 5000,
            discount: 10,
            discount_type: "percentage",
          },
          {
            _id: "6ae2e6e0a8448da0f3c60dd2",
            name: "Annual (12 Months)",
            months: 12,
            price: 18000,
            discount: 20,
            discount_type: "percentage",
          },
        ],
      }),
    },
    post: {
      tags: ["Super Admin - Packages"],
      summary: "Create Package",
      security: [{ SuperAdminAuth: [] }],
      requestBody: jsonBody({
        name: "Elite Package",
        game_id: "6ae2e6e0a8448da0f3c60dc0",
        teams: 10,
        players: 40,
        status: true,
        cycles: [
          {
            name: "1 Year",
            months: 12,
            price: 25000,
            discount: 15,
            discount_type: "percentage",
          },
        ],
      }),
      responses: singleResponse("package", { _id: "6ae2e6e0a8448da0f3c60dd5", name: "Elite Package" }, 201),
    },
  };

  paths["/api/packages/{id}"] = {
    get: {
      tags: ["Super Admin - Packages"],
      summary: "Get Package by ID",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      responses: singleResponse("package", { _id: "6ae2e6e0a8448da0f3c60dd0", name: "Pro Club Package" }),
    },
    put: {
      tags: ["Super Admin - Packages"],
      summary: "Update Package",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      requestBody: jsonBody({
        name: "Pro Club Package (Updated)",
        teams: 8,
        players: 35,
      }),
      responses: singleResponse("package", { _id: "6ae2e6e0a8448da0f3c60dd0", name: "Pro Club Package (Updated)" }),
    },
    delete: {
      tags: ["Super Admin - Packages"],
      summary: "Delete Package",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      responses: singleResponse("id", "6ae2e6e0a8448da0f3c60dd0", 200, "Package deleted successfully"),
    },
  };

  // ==========================================
  // [Super Admin] Clubs
  // ==========================================
  paths["/api/clubs"] = {
    get: {
      tags: ["Super Admin - Clubs"],
      summary: "List Clubs / Tenants",
      security: [{ SuperAdminAuth: [] }],
      parameters: standardListParams([
        { name: "subscription_status", in: "query", schema: { type: "string", enum: ["active", "grace", "expired", "pending", "inactive"] } },
        { name: "package_id", in: "query", schema: { type: "string" } },
      ]),
      responses: paginatedResponse("Club", {
        _id: "6ae2e6e0a8448da0f3c60de0",
        name: "Al Ahly SC",
        subdomain: "ahly",
        status: true,
        package_id: { _id: "6ae2e6e0a8448da0f3c60dd0", name: "Pro Club Package" },
        start_date: "2026-01-01T00:00:00.000Z",
        end_date: "2027-01-01T00:00:00.000Z",
        subscription: {
          status: "active",
          days_left: 64,
          grace_days_left: null,
          is_late_renewal: false,
        },
      }),
    },
    post: {
      tags: ["Super Admin - Clubs"],
      summary: "Create Club / Tenant",
      description: "Registers a new club and provisions its isolated database with initial admin and settings",
      security: [{ SuperAdminAuth: [] }],
      requestBody: jsonBody({
        name: "Zamalek SC",
        subdomain: "zamalek",
        package_id: "6ae2e6e0a8448da0f3c60dd0",
        start_date: "2026-10-01T00:00:00.000Z",
        end_date: "2027-10-01T00:00:00.000Z",
        status: true,
      }),
      responses: singleResponse("club", {
        _id: "6ae2e6e0a8448da0f3c60de1",
        name: "Zamalek SC",
        subdomain: "zamalek",
      }, 201, "Club created successfully"),
    },
  };

  paths["/api/clubs/{id}"] = {
    get: {
      tags: ["Super Admin - Clubs"],
      summary: "Get Club by ID",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      responses: singleResponse("club", { _id: "6ae2e6e0a8448da0f3c60de0", name: "Al Ahly SC", subdomain: "ahly" }),
    },
    put: {
      tags: ["Super Admin - Clubs"],
      summary: "Update Club",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      requestBody: jsonBody({ name: "Al Ahly Sporting Club", status: true }),
      responses: singleResponse("club", { _id: "6ae2e6e0a8448da0f3c60de0", name: "Al Ahly Sporting Club" }),
    },
    delete: {
      tags: ["Super Admin - Clubs"],
      summary: "Delete Club",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      responses: singleResponse("id", "6ae2e6e0a8448da0f3c60de0", 200, "Club deleted successfully"),
    },
  };

  paths["/api/clubs/{id}/tenant"] = {
    get: {
      tags: ["Super Admin - Clubs"],
      summary: "Get Tenant Database Counts",
      description: "Inspects the isolated MongoDB database of this club and counts rows in teams, players, matches, etc.",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      responses: {
        200: {
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  club: { _id: "6ae2e6e0a8448da0f3c60de0", name: "Al Ahly SC", subdomain: "ahly" },
                  database: "ahly",
                  collections: {
                    teams: 4,
                    players: 65,
                    matches: 12,
                    player_progress: 340,
                    admins: 2,
                    cart: 3,
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  paths["/api/clubs/{id}/tenant/reset-admin"] = {
    post: {
      tags: ["Super Admin - Clubs"],
      summary: "Forgot Club Password (Reset from Super Admin)",
      description: "Resets the club admin password without touching DB directly. Generates strong random password if none is provided and returns it once.",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      requestBody: jsonBody({
        email: "admin@ahly.com",
        password: "OptionalCustomPassword123",
        activate: true,
      }),
      responses: {
        200: {
          content: {
            "application/json": {
              example: {
                success: true,
                message: "Tenant admin password reset successfully",
                data: {
                  club: { name: "Al Ahly SC", subdomain: "ahly", database: "ahly" },
                  admin: { email: "admin@ahly.com", role: "admin", status: true },
                  password: "Xk3vQ9tRm2Lp",
                  generated: true,
                  created: false,
                },
              },
            },
          },
        },
      },
    },
  };

  // ==========================================
  // [Super Admin] Payment Methods
  // ==========================================
  paths["/api/payment-methods"] = {
    get: {
      tags: ["Super Admin - Payment Methods"],
      summary: "List Payment Methods",
      security: [{ SuperAdminAuth: [] }],
      parameters: standardListParams(),
      responses: paginatedResponse("PaymentMethod", {
        _id: "6ae2e6e0a8448da0f3c60df0",
        name: "InstaPay",
        status: true,
        description: "Transfer to instapay address: scouting@instapay",
        icon: "https://sportego.org/uploads/instapay.png",
      }),
    },
    post: {
      tags: ["Super Admin - Payment Methods"],
      summary: "Create Payment Method",
      security: [{ SuperAdminAuth: [] }],
      requestBody: jsonBody({
        name: "Vodafone Cash",
        status: true,
        description: "Send wallet transfer to 01012345678",
      }),
      responses: singleResponse("paymentMethod", { _id: "6ae2e6e0a8448da0f3c60df1", name: "Vodafone Cash" }, 201),
    },
  };

  // ==========================================
  // [Super Admin] Orders & Invoices
  // ==========================================
  paths["/api/orders"] = {
    get: {
      tags: ["Super Admin - Orders & Invoices"],
      summary: "List Orders",
      security: [{ SuperAdminAuth: [] }],
      parameters: standardListParams([
        { name: "club_id", in: "query", schema: { type: "string" } },
        { name: "package_id", in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string", enum: ["pending", "paid", "rejected", "cancelled", "refunded"] } },
        { name: "order_number", in: "query", schema: { type: "string" } },
      ]),
      responses: paginatedResponse("Order", {
        _id: "6ae2e88d1540b80d32644b80",
        order_number: "ORD-2026-000001",
        club_id: { _id: "6ae2e6e0a8448da0f3c60de0", name: "Al Ahly SC", subdomain: "ahly" },
        package_id: { _id: "6ae2e6e0a8448da0f3c60dd0", name: "Pro Club Package" },
        payment_method_id: { _id: "6ae2e6e0a8448da0f3c60df0", name: "InstaPay" },
        price: 18000,
        discount: 3600,
        fine: 0,
        final_price: 14400,
        status: "pending",
        payment_proof: "/uploads/proof-12345.png",
        payment_reference: "INSTAPAY-TXN-9876",
        applied_to_subscription: false,
      }),
    },
    post: {
      tags: ["Super Admin - Orders & Invoices"],
      summary: "Create Order (Manual Entry)",
      security: [{ SuperAdminAuth: [] }],
      requestBody: jsonBody({
        club_id: "6ae2e6e0a8448da0f3c60de0",
        package_id: "6ae2e6e0a8448da0f3c60dd0",
        cycle_id: "6ae2e6e0a8448da0f3c60dd1",
        payment_method_id: "6ae2e6e0a8448da0f3c60df0",
        price: 5000,
        discount: 500,
        fine: 0,
        status: "pending",
      }),
      responses: singleResponse("order", { _id: "6ae2e88d1540b80d32644b80", order_number: "ORD-2026-000002" }, 201),
    },
  };

  paths["/api/orders/{id}"] = {
    get: {
      tags: ["Super Admin - Orders & Invoices"],
      summary: "Get Order Details",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      responses: singleResponse("order", {
        _id: "6ae2e88d1540b80d32644b80",
        order_number: "ORD-2026-000001",
        status: "pending",
        final_price: 14400,
      }),
    },
  };

  paths["/api/orders/{id}/approve"] = {
    post: {
      tags: ["Super Admin - Orders & Invoices"],
      summary: "Approve Order & Extend Club Subscription",
      description: "Super admin marks the pending order as paid. This atomically extends the club's end_date by the package cycle length.",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      requestBody: jsonBody({ notes: "Payment verified on bank statement" }),
      responses: singleResponse("order", {
        _id: "6ae2e88d1540b80d32644b80",
        status: "paid",
        applied_to_subscription: true,
      }, 200, "Order approved successfully"),
    },
  };

  paths["/api/orders/{id}/reject"] = {
    post: {
      tags: ["Super Admin - Orders & Invoices"],
      summary: "Reject Order",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      requestBody: jsonBody({ reason: "Payment receipt unreadable or transfer not received" }),
      responses: singleResponse("order", {
        _id: "6ae2e88d1540b80d32644b80",
        status: "rejected",
        rejection_reason: "Payment receipt unreadable or transfer not received",
      }, 200, "Order rejected successfully"),
    },
  };

  paths["/api/orders/{id}/payment-proof"] = {
    post: {
      tags: ["Super Admin - Orders & Invoices"],
      summary: "Upload Order Payment Proof Receipt",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      requestBody: multipartBody("image"),
      responses: singleResponse("order", {
        _id: "6ae2e88d1540b80d32644b80",
        payment_proof: "/uploads/proof-1234.png",
      }),
    },
  };

  paths["/api/orders/{id}/invoice"] = {
    get: {
      tags: ["Super Admin - Orders & Invoices"],
      summary: "Get Order Invoice (JSON / HTML)",
      description: "Returns structured invoice data. Pass `?format=html` to render printable HTML.",
      security: [{ SuperAdminAuth: [] }],
      parameters: [
        ...idParam(),
        { name: "format", in: "query", schema: { type: "string", enum: ["json", "html"] }, description: "Response format" },
      ],
      responses: {
        200: {
          description: "Structured Invoice JSON or HTML",
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  invoice: {
                    invoice_number: "INV-ORD-2026-000001",
                    order_number: "ORD-2026-000001",
                    status: "paid",
                    is_paid: true,
                    issued_at: "2026-10-29T08:00:00.000Z",
                    club: { id: "6ae2e6e0a8448da0f3c60de0", name: "Al Ahly SC", subdomain: "ahly" },
                    provider: { name: "Scouting Platform", service: "Club Scouting & Analytics Management System" },
                    item: {
                      package_name: "Pro Club Package",
                      game_name: "Football",
                      cycle_name: "Annual (12 Months)",
                      months: 12,
                      unit_price: 18000,
                      discount: 3600,
                      fine: 0,
                      final_price: 14400,
                    },
                    pricing: { subtotal: 18000, discount: 3600, fine: 0, total: 14400, currency: "EGP" },
                    payment: { method_name: "InstaPay", payment_reference: "TXN-12345" },
                  },
                },
              },
            },
            "text/html": {
              schema: { type: "string" },
            },
          },
        },
      },
    },
  };

  paths["/api/orders/{id}/invoice/html"] = {
    get: {
      tags: ["Super Admin - Orders & Invoices"],
      summary: "Printable HTML Invoice",
      description: "Directly returns clean, print-ready HTML page with print button",
      security: [{ SuperAdminAuth: [] }],
      parameters: idParam(),
      responses: {
        200: {
          description: "HTML Invoice page",
          content: { "text/html": { schema: { type: "string" } } },
        },
      },
    },
  };

  // ==========================================
  // [Super Admin] Settings & Uploads
  // ==========================================
  paths["/api/settings"] = {
    get: {
      tags: ["Super Admin - Settings"],
      summary: "Get Global Settings",
      security: [{ SuperAdminAuth: [] }],
      responses: singleResponse("settings", {
        key: "global",
        allowed_days: 14,
        notification: true,
        fines: 500,
      }),
    },
    put: {
      tags: ["Super Admin - Settings"],
      summary: "Update Global Settings",
      security: [{ SuperAdminAuth: [] }],
      requestBody: jsonBody({
        allowed_days: 14,
        notification: true,
        fines: 500,
      }),
      responses: singleResponse("settings", {
        allowed_days: 14,
        notification: true,
        fines: 500,
      }),
    },
  };

  paths["/api/uploads"] = {
    post: {
      tags: ["Super Admin - Uploads"],
      summary: "Upload General Image",
      security: [{ SuperAdminAuth: [] }],
      requestBody: multipartBody("image"),
      responses: singleResponse("file", {
        filename: "img-123456.png",
        url: "/uploads/img-123456.png",
        absolute_url: "http://localhost:4000/uploads/img-123456.png",
      }, 201),
    },
  };

  // ==========================================
  // [Tenant] Auth & Info
  // ==========================================
  paths["/api/tenant/auth/login"] = {
    post: {
      tags: ["Tenant - Auth"],
      summary: "Club Member Login",
      description: "Authenticates club admin, coach, or viewer against this club's isolated database.",
      parameters: [
        {
          name: "x-subdomain",
          in: "header",
          required: true,
          schema: { type: "string", example: "ahly" },
          description: "Club subdomain identifier",
        },
      ],
      requestBody: jsonBody({
        email: "admin@ahly.com",
        password: "Tenant@123456",
      }),
      responses: {
        200: {
          content: {
            "application/json": {
              example: {
                success: true,
                message: "Login successful",
                data: {
                  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                  admin: {
                    id: "6ae2e6e0a8448da0f3c60de8",
                    name: "Ahly Admin",
                    email: "admin@ahly.com",
                    role: "admin",
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  paths["/api/tenant/auth/me"] = {
    get: {
      tags: ["Tenant - Auth"],
      summary: "Get Current Tenant User Profile",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      responses: singleResponse("admin", {
        id: "6ae2e6e0a8448da0f3c60de8",
        name: "Ahly Admin",
        email: "admin@ahly.com",
        role: "admin",
      }),
    },
  };

  paths["/api/tenant/auth/change-password"] = {
    put: {
      tags: ["Tenant - Auth"],
      summary: "Change Tenant Password",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: jsonBody({
        current_password: "Tenant@123456",
        new_password: "NewTenant@123456",
      }),
      responses: singleResponse("admin", { email: "admin@ahly.com" }, 200, "Password changed successfully"),
    },
  };

  paths["/api/tenant/info"] = {
    get: {
      tags: ["Tenant - Info & Overview"],
      summary: "Tenant Club Overview & Subscription Status",
      description: "Returns everything the tenant dashboard needs on initial load: club profile, days left in subscription, database name, settings, and entity counts.",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      responses: {
        200: {
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  club: {
                    id: "6ae2e6e0a8448da0f3c60de0",
                    name: "Al Ahly SC",
                    subdomain: "ahly",
                    status: true,
                    start_date: "2026-01-01T00:00:00.000Z",
                    end_date: "2027-01-01T00:00:00.000Z",
                  },
                  subscription: {
                    status: "active",
                    days_left: 64,
                    grace_days_left: null,
                    is_late_renewal: false,
                    allowed_days: 14,
                  },
                  database: "ahly",
                  settings: {
                    logo: "/uploads/ahly-logo.png",
                    background_color: ["#e11d48"],
                    color: ["#ffffff"],
                  },
                  counts: {
                    teams: 3,
                    players: 48,
                    matches: 8,
                    player_progress: 180,
                    cart: 2,
                    admins: 3,
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  // ==========================================
  // [Tenant] Packages (Store)
  // ==========================================
  paths["/api/tenant/packages"] = {
    get: {
      tags: ["Tenant - Packages (Store)"],
      summary: "Browse Available Packages to Buy / Renew",
      description: "Returns all active subscription packages with calculated savings, durations, and whether the package is the club's current active plan.",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: [
        { name: "game_id", in: "query", schema: { type: "string" }, description: "Filter by game" },
        { name: "search", in: "query", schema: { type: "string" }, description: "Search by package name" },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  packages: [
                    {
                      _id: "6ae2e6e0a8448da0f3c60dd0",
                      name: "Pro Club Package",
                      game: { _id: "6ae2e6e0a8448da0f3c60dc0", name: "Football" },
                      teams: 5,
                      players: 30,
                      is_current: true,
                      cycles: [
                        {
                          _id: "6ae2e6e0a8448da0f3c60dd1",
                          name: "Quarterly (3 Months)",
                          months: 3,
                          price: 5000,
                          discount: 10,
                          discount_type: "percentage",
                          discount_amount: 500,
                          final_price: 4500,
                        },
                        {
                          _id: "6ae2e6e0a8448da0f3c60dd2",
                          name: "Annual (12 Months)",
                          months: 12,
                          price: 18000,
                          discount: 20,
                          discount_type: "percentage",
                          discount_amount: 3600,
                          final_price: 14400,
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  };

  paths["/api/tenant/packages/{id}"] = {
    get: {
      tags: ["Tenant - Packages (Store)"],
      summary: "Get Single Package Details",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("package", {
        _id: "6ae2e6e0a8448da0f3c60dd0",
        name: "Pro Club Package",
        is_current: true,
        cycles: [{ name: "Annual (12 Months)", months: 12, price: 18000, final_price: 14400 }],
      }),
    },
  };

  // ==========================================
  // [Tenant] Payment Methods
  // ==========================================
  paths["/api/tenant/payment-methods"] = {
    get: {
      tags: ["Tenant - Payment Methods"],
      summary: "List Payment Methods & Transfer Instructions",
      description: "Returns active payment methods where clubs can transfer subscription fees (e.g. InstaPay address, Vodafone Cash, Bank Account).",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      responses: {
        200: {
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  payment_methods: [
                    {
                      _id: "6ae2e6e0a8448da0f3c60df0",
                      name: "InstaPay",
                      description: "Send payment to: scouting@instapay",
                      status: true,
                      icon: "https://sportego.org/uploads/instapay.png",
                    },
                    {
                      _id: "6ae2e6e0a8448da0f3c60df1",
                      name: "Vodafone Cash",
                      description: "Send to wallet 01012345678",
                      status: true,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  };

  // ==========================================
  // [Tenant] Orders & Invoices
  // ==========================================
  paths["/api/tenant/orders"] = {
    get: {
      tags: ["Tenant - Orders & Invoices"],
      summary: "List Club Orders & Purchases",
      description: "Returns all past and current package orders made by this club, with approval status and pricing snapshots.",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: standardListParams([
        { name: "status", in: "query", schema: { type: "string", enum: ["pending", "paid", "rejected", "cancelled", "refunded"] } },
      ]),
      responses: paginatedResponse("Order", {
        _id: "6ae2e88d1540b80d32644b80",
        order_number: "ORD-2026-000001",
        price: 18000,
        discount: 3600,
        fine: 0,
        final_price: 14400,
        status: "pending",
        payment_method_id: { name: "InstaPay" },
        package_id: { name: "Pro Club Package" },
      }),
    },
    post: {
      tags: ["Tenant - Orders & Invoices"],
      summary: "Direct Package Purchase (Buy Now)",
      description: "Instantly creates a pending order for this club (without needing separate cart steps). Also logs the purchase in the club's cart collection for synchronization.",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: jsonBody({
        package_id: "6ae2e6e0a8448da0f3c60dd0",
        cycle_id: "6ae2e6e0a8448da0f3c60dd2",
        payment_method_id: "6ae2e6e0a8448da0f3c60df0",
        payment_reference: "INSTAPAY-TXN-9876",
        notes: "Direct checkout from tenant portal",
      }),
      responses: {
        201: {
          content: {
            "application/json": {
              example: {
                success: true,
                message: "Package purchased successfully. Your order is pending super admin approval.",
                data: {
                  order: {
                    _id: "6ae2e88d1540b80d32644b80",
                    order_number: "ORD-2026-000001",
                    final_price: 14400,
                    status: "pending",
                  },
                  cart: {
                    _id: "6ae2e88d1540b80d32644b81",
                    status: "checked_out",
                    cycle_name: "Annual (12 Months)",
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  paths["/api/tenant/orders/{id}"] = {
    get: {
      tags: ["Tenant - Orders & Invoices"],
      summary: "Get Order Details",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("order", {
        _id: "6ae2e88d1540b80d32644b80",
        order_number: "ORD-2026-000001",
        status: "pending",
        final_price: 14400,
      }),
    },
  };

  paths["/api/tenant/orders/{id}/payment-proof"] = {
    post: {
      tags: ["Tenant - Orders & Invoices"],
      summary: "Upload Order Payment Screenshot / Receipt",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      requestBody: multipartBody("image"),
      responses: singleResponse("order", {
        _id: "6ae2e88d1540b80d32644b80",
        payment_proof: "/uploads/proof-club-123.png",
      }),
    },
  };

  paths["/api/tenant/orders/{id}/invoice"] = {
    get: {
      tags: ["Tenant - Orders & Invoices"],
      summary: "Get Order Invoice (JSON / HTML)",
      description: "Returns structured invoice data for this club's order. Pass `?format=html` to get printable HTML.",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: [
        ...idParam(),
        { name: "format", in: "query", schema: { type: "string", enum: ["json", "html"] } },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  invoice: {
                    invoice_number: "INV-ORD-2026-000001",
                    order_number: "ORD-2026-000001",
                    status: "paid",
                    is_paid: true,
                    club: { name: "Al Ahly SC", subdomain: "ahly" },
                    item: {
                      package_name: "Pro Club Package",
                      cycle_name: "Annual (12 Months)",
                      months: 12,
                      unit_price: 18000,
                      discount: 3600,
                      final_price: 14400,
                    },
                    pricing: { total: 14400, currency: "EGP" },
                    payment: { method_name: "InstaPay", payment_reference: "INSTAPAY-TXN-9876" },
                  },
                },
              },
            },
            "text/html": { schema: { type: "string" } },
          },
        },
      },
    },
  };

  paths["/api/tenant/orders/{id}/invoice/html"] = {
    get: {
      tags: ["Tenant - Orders & Invoices"],
      summary: "Printable HTML Invoice for Club",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: {
        200: {
          description: "Clean HTML invoice ready for print or saving as PDF",
          content: { "text/html": { schema: { type: "string" } } },
        },
      },
    },
  };

  // ==========================================
  // [Tenant] Cart & Checkout
  // ==========================================
  paths["/api/tenant/cart"] = {
    get: {
      tags: ["Tenant - Cart & Checkout"],
      summary: "List Cart Items",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: standardListParams(),
      responses: paginatedResponse("Cart", {
        _id: "6ae2e88d1540b80d32644b57",
        package_id: "6ae2e6e0a8448da0f3c60dd0",
        cycle_name: "Quarterly",
        months: 3,
        price: 5000,
        discount: 500,
        final_price: 4500,
        status: "cart",
      }),
    },
    post: {
      tags: ["Tenant - Cart & Checkout"],
      summary: "Add Package to Cart",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: jsonBody({
        package_id: "6ae2e6e0a8448da0f3c60dd0",
        cycle_id: "6ae2e6e0a8448da0f3c60dd1",
      }),
      responses: singleResponse("cart", {
        _id: "6ae2e88d1540b80d32644b57",
        status: "cart",
        final_price: 4500,
      }, 201),
    },
  };

  paths["/api/tenant/cart/{id}/checkout"] = {
    post: {
      tags: ["Tenant - Cart & Checkout"],
      summary: "Checkout Cart Item -> Pending Order",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      requestBody: jsonBody({
        payment_method_id: "6ae2e6e0a8448da0f3c60df0",
        payment_reference: "REF-12345",
      }),
      responses: {
        201: {
          content: {
            "application/json": {
              example: {
                success: true,
                message: "Order created and sent to the super admin for review",
                data: {
                  cart: { _id: "6ae2e88d1540b80d32644b57", status: "checked_out" },
                  order: { _id: "6ae2e88d1540b80d32644b80", order_number: "ORD-2026-000001", status: "pending" },
                },
              },
            },
          },
        },
      },
    },
  };

  // ==========================================
  // [Tenant] Settings & Branding
  // ==========================================
  paths["/api/tenant/settings"] = {
    get: {
      tags: ["Tenant - Settings & Branding"],
      summary: "Get Club Branding & Settings",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      responses: singleResponse("settings", {
        logo: "/uploads/club-logo.png",
        background_color: ["#e11d48"],
        color: ["#ffffff"],
      }),
    },
    put: {
      tags: ["Tenant - Settings & Branding"],
      summary: "Update Club Branding (Colors/Logo URL)",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: jsonBody({
        logo: "/uploads/club-logo.png",
        background_color: ["#e11d48", "#9f1239"],
        color: ["#ffffff"],
      }),
      responses: singleResponse("settings", {
        background_color: ["#e11d48", "#9f1239"],
      }),
    },
  };

  paths["/api/tenant/settings/logo"] = {
    post: {
      tags: ["Tenant - Settings & Branding"],
      summary: "Upload Club Logo",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: multipartBody("image"),
      responses: singleResponse("settings", { logo: "/uploads/club-logo.png" }),
    },
  };

  // ==========================================
  // [Tenant] Teams
  // ==========================================
  paths["/api/tenant/teams"] = {
    get: {
      tags: ["Tenant - Teams"],
      summary: "List Teams",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: standardListParams([
        { name: "game_id", in: "query", schema: { type: "string" }, description: "Filter by game ID" },
      ]),
      responses: paginatedResponse("Team", {
        _id: "6ae2e88d1540b80d32644ad1",
        name: "First Football Team",
        game_id: "6ae2e6e0a8448da0f3c60dc0",
        players: 22,
      }),
    },
    post: {
      tags: ["Tenant - Teams"],
      summary: "Create Team",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: jsonBody({
        name: "Under 19 Team",
        game_id: "6ae2e6e0a8448da0f3c60dc0",
      }),
      responses: singleResponse("team", {
        _id: "6ae2e88d1540b80d32644ad2",
        name: "Under 19 Team",
        players: 0,
      }, 201),
    },
  };

  paths["/api/tenant/teams/select"] = {
    get: {
      tags: ["Tenant - Teams"],
      summary: "Select Teams (Dropdown)",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: [
        { name: "game_id", in: "query", schema: { type: "string" } },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  teams: [
                    { _id: "6ae2e88d1540b80d32644ad1", name: "First Football Team" },
                  ],
                },
              },
            },
          },
        },
      },
    },
  };

  paths["/api/tenant/teams/{id}"] = {
    get: {
      tags: ["Tenant - Teams"],
      summary: "Get Team by ID",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("team", { _id: "6ae2e88d1540b80d32644ad1", name: "First Football Team" }),
    },
    put: {
      tags: ["Tenant - Teams"],
      summary: "Update Team",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      requestBody: jsonBody({ name: "Senior Football Team" }),
      responses: singleResponse("team", { name: "Senior Football Team" }),
    },
    delete: {
      tags: ["Tenant - Teams"],
      summary: "Delete Team",
      description: "Cannot delete team if it contains players or matches",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("id", "6ae2e88d1540b80d32644ad1", 200, "Team deleted successfully"),
    },
  };

  // ==========================================
  // [Tenant] Players
  // ==========================================
  paths["/api/tenant/players"] = {
    get: {
      tags: ["Tenant - Players"],
      summary: "List Players",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: standardListParams([
        { name: "team_id", in: "query", schema: { type: "string" } },
        { name: "game_id", in: "query", schema: { type: "string" } },
      ]),
      responses: paginatedResponse("Player", {
        _id: "6ae2e88d1540b80d32644ae7",
        name: "Mohamed Salah",
        height: 175,
        weight: 71,
        age: 28,
        team_id: { _id: "6ae2e88d1540b80d32644ad1", name: "First Football Team" },
        game_id: { _id: "6ae2e6e0a8448da0f3c60dc0", name: "Football" },
      }),
    },
    post: {
      tags: ["Tenant - Players"],
      summary: "Create Player",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: jsonBody({
        name: "Emam Ashour",
        height: 182,
        weight: 76,
        age: 26,
        team_id: "6ae2e88d1540b80d32644ad1",
      }),
      responses: singleResponse("player", {
        _id: "6ae2e88d1540b80d32644ae8",
        name: "Emam Ashour",
      }, 201),
    },
  };

  paths["/api/tenant/players/{id}"] = {
    get: {
      tags: ["Tenant - Players"],
      summary: "Get Player by ID",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("player", { _id: "6ae2e88d1540b80d32644ae7", name: "Mohamed Salah" }),
    },
    put: {
      tags: ["Tenant - Players"],
      summary: "Update Player",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      requestBody: jsonBody({ weight: 72 }),
      responses: singleResponse("player", { name: "Mohamed Salah", weight: 72 }),
    },
    delete: {
      tags: ["Tenant - Players"],
      summary: "Delete Player",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("id", "6ae2e88d1540b80d32644ae7", 200, "Player deleted successfully"),
    },
  };

  // ==========================================
  // [Tenant] Matches
  // ==========================================
  paths["/api/tenant/matches"] = {
    get: {
      tags: ["Tenant - Matches"],
      summary: "List Matches",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: standardListParams([
        { name: "team_id", in: "query", schema: { type: "string" } },
        { name: "from", in: "query", schema: { type: "string", format: "date" } },
        { name: "to", in: "query", schema: { type: "string", format: "date" } },
      ]),
      responses: paginatedResponse("Match", {
        _id: "6ae2e88d1540b80d32644b00",
        name: "League Final Round",
        date: "2026-10-30T18:00:00.000Z",
        team_id: { _id: "6ae2e88d1540b80d32644ad1", name: "First Football Team" },
        opponent_name: "Cairo Stars",
      }),
    },
    post: {
      tags: ["Tenant - Matches"],
      summary: "Create Match",
      description: "Supports two formats: either our team vs external opponent (`team_id` + `opponent_name`) OR two internal teams (`team1_id` + `team2_id`).",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: jsonBody({
        name: "Friendly Match",
        date: "2026-11-05T19:00:00.000Z",
        team_id: "6ae2e88d1540b80d32644ad1",
        opponent_name: "Alexandria SC",
      }),
      responses: singleResponse("match", { _id: "6ae2e88d1540b80d32644b01", name: "Friendly Match" }, 201),
    },
  };

  paths["/api/tenant/matches/{id}"] = {
    get: {
      tags: ["Tenant - Matches"],
      summary: "Get Match by ID",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("match", { _id: "6ae2e88d1540b80d32644b00", name: "League Final Round" }),
    },
    put: {
      tags: ["Tenant - Matches"],
      summary: "Update Match",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      requestBody: jsonBody({ name: "Cup Final Match" }),
      responses: singleResponse("match", { name: "Cup Final Match" }),
    },
    delete: {
      tags: ["Tenant - Matches"],
      summary: "Delete Match",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("id", "6ae2e88d1540b80d32644b00", 200, "Match deleted successfully"),
    },
  };

  // ==========================================
  // [Tenant] Player Progress
  // ==========================================
  paths["/api/tenant/player-progress"] = {
    get: {
      tags: ["Tenant - Player Progress"],
      summary: "List Match Scouting Action Progress",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: standardListParams([
        { name: "match_id", in: "query", schema: { type: "string" } },
        { name: "player_id", in: "query", schema: { type: "string" } },
        { name: "action_id", in: "query", schema: { type: "string" } },
      ]),
      responses: paginatedResponse("PlayerProgress", {
        _id: "6ae2e88d1540b80d32644b20",
        match_id: { _id: "6ae2e88d1540b80d32644b00", name: "League Final Round" },
        player_id: { _id: "6ae2e88d1540b80d32644ae7", name: "Mohamed Salah" },
        action_id: { _id: "6ae2e6e0a8448da0f3c60dc5", name: "Goal" },
        createdAt: "2026-10-30T18:24:00.000Z",
      }),
    },
    post: {
      tags: ["Tenant - Player Progress"],
      summary: "Record Player Action Event in Match",
      description: "Registers an action event for a player. Automatically verifies that the action belongs to the game and that the player's team participated in this match.",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: jsonBody({
        match_id: "6ae2e88d1540b80d32644b00",
        player_id: "6ae2e88d1540b80d32644ae7",
        action_id: "6ae2e6e0a8448da0f3c60dc5",
      }),
      responses: singleResponse("player_progress", {
        _id: "6ae2e88d1540b80d32644b21",
        player_id: "6ae2e88d1540b80d32644ae7",
        action_id: "6ae2e6e0a8448da0f3c60dc5",
      }, 201),
    },
  };

  paths["/api/tenant/player-progress/{id}"] = {
    delete: {
      tags: ["Tenant - Player Progress"],
      summary: "Delete Player Action Event",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("id", "6ae2e88d1540b80d32644b20", 200, "Player progress deleted successfully"),
    },
  };

  // ==========================================
  // [Tenant] Sub-Admins
  // ==========================================
  paths["/api/tenant/admins"] = {
    get: {
      tags: ["Tenant - Sub-Admins"],
      summary: "List Club Admins / Coaches",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: standardListParams(),
      responses: paginatedResponse("TenantAdmin", {
        _id: "6ae2e6e0a8448da0f3c60de8",
        name: "Ahly Admin",
        email: "admin@ahly.com",
        role: "admin",
        status: true,
      }),
    },
    post: {
      tags: ["Tenant - Sub-Admins"],
      summary: "Create Club Staff Account",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: jsonBody({
        name: "Coach Hossam",
        email: "hossam@ahly.com",
        password: "Coach@123456",
        role: "coach",
        status: true,
      }),
      responses: singleResponse("admin", { _id: "6ae2e6e0a8448da0f3c60de9", email: "hossam@ahly.com", role: "coach" }, 201),
    },
  };

  paths["/api/tenant/admins/{id}"] = {
    get: {
      tags: ["Tenant - Sub-Admins"],
      summary: "Get Sub-Admin Details",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("admin", { name: "Coach Hossam", email: "hossam@ahly.com", role: "coach" }),
    },
    put: {
      tags: ["Tenant - Sub-Admins"],
      summary: "Update Sub-Admin",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      requestBody: jsonBody({ name: "Head Coach Hossam", role: "coach" }),
      responses: singleResponse("admin", { name: "Head Coach Hossam", role: "coach" }),
    },
    delete: {
      tags: ["Tenant - Sub-Admins"],
      summary: "Delete Sub-Admin Account",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      parameters: idParam(),
      responses: singleResponse("id", "6ae2e6e0a8448da0f3c60de9", 200, "Admin deleted successfully"),
    },
  };

  // ==========================================
  // [Tenant] Uploads
  // ==========================================
  paths["/api/tenant/uploads"] = {
    post: {
      tags: ["Tenant - Uploads"],
      summary: "Upload Image for Club",
      security: [{ TenantAuth: [] }, { TenantSubdomain: [] }],
      requestBody: multipartBody("image"),
      responses: singleResponse("file", {
        filename: "player-photo-123.jpg",
        url: "/uploads/player-photo-123.jpg",
        absolute_url: "http://localhost:4000/uploads/player-photo-123.jpg",
      }, 201),
    },
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "Scouting Platform API (Super Admin & Multi-Tenant Clubs)",
      version: "1.0.0",
      description: `Complete API specification for the Scouting Multi-Tenant Platform.\n\nReady for direct import into **ApiDog**, **Postman**, or Swagger UI.`,
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "Local Development Server (Use 'x-subdomain' header for tenant routes)",
      },
      {
        url: "https://sportego.org",
        description: "Production Server (sportego.org)",
      },
      {
        url: "https://{subdomain}.sportego.org",
        description: "Tenant Club Production Host (Wildcard subdomain)",
        variables: {
          subdomain: {
            default: "ahly",
            description: "Club subdomain identifier",
          },
        },
      },
    ],
    components: {
      securitySchemes: {
        SuperAdminAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Super Admin JWT token returned from POST /api/auth/login",
        },
        TenantAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Tenant JWT token returned from POST /api/tenant/auth/login",
        },
        TenantSubdomain: {
          type: "apiKey",
          in: "header",
          name: "x-subdomain",
          description: "Subdomain of the club (e.g. 'ahly'). Required for /api/tenant/* routes when developing on localhost.",
        },
      },
      schemas: {
        PaginationMeta: {
          type: "object",
          properties: {
            total: { type: "integer", example: 45 },
            page: { type: "integer", example: 1 },
            limit: { type: "integer", example: 10 },
            totalPages: { type: "integer", example: 5 },
            hasNextPage: { type: "boolean", example: true },
            hasPrevPage: { type: "boolean", example: false },
          },
        },
      },
      responses: {
        BadRequest: {
          description: "Validation error or invalid request body",
          content: {
            "application/json": {
              example: {
                success: false,
                error: {
                  code: 400,
                  message: "Validation error",
                  details: [{ path: ["email"], message: "Invalid email address" }],
                },
              },
            },
          },
        },
        Unauthorized: {
          description: "Missing or invalid Bearer token",
          content: {
            "application/json": {
              example: {
                success: false,
                error: { code: 401, message: "Authorization token required" },
              },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              example: {
                success: false,
                error: { code: 404, message: "Resource not found" },
              },
            },
          },
        },
      },
    },
    paths,
  };
}

export function generateAllSpecs(targetDir: string) {
  const fullSpec = buildOpenApiSpec();

  // 1. Full Combined openAPI.json
  const fullPath = path.join(targetDir, "openapi.json");
  fs.writeFileSync(fullPath, JSON.stringify(fullSpec, null, 2), "utf8");
  console.log(`✅ Generated master OpenAPI specification: ${fullPath}`);

  // 2. Super Admin Only openapi-superadmin.json
  const superAdminPaths: Record<string, any> = {};
  for (const [p, methods] of Object.entries(fullSpec.paths)) {
    if (!p.startsWith("/api/tenant")) {
      superAdminPaths[p] = methods;
    }
  }
  const superAdminSpec = {
    ...fullSpec,
    info: {
      title: "Scouting Super Admin API",
      version: "1.0.0",
      description: "API for Super Admin managing Games, Actions, Packages, Clubs, Orders, Invoices, and Platform Settings.",
    },
    paths: superAdminPaths,
  };
  const superAdminPath = path.join(targetDir, "openapi-superadmin.json");
  fs.writeFileSync(superAdminPath, JSON.stringify(superAdminSpec, null, 2), "utf8");
  console.log(`✅ Generated Super Admin OpenAPI specification: ${superAdminPath}`);

  // 3. Tenant Only openapi-tenant.json
  const tenantPaths: Record<string, any> = {};
  for (const [p, methods] of Object.entries(fullSpec.paths)) {
    if (p.startsWith("/api/tenant") || p === "/health") {
      tenantPaths[p] = methods;
    }
  }
  const tenantSpec = {
    ...fullSpec,
    info: {
      title: "Scouting Tenant Club API",
      version: "1.0.0",
      description: "API for Club Tenant managing Team Roster, Players, Matches, Scouting Progress, Subscriptions, Packages, and Invoices.",
    },
    paths: tenantPaths,
  };
  const tenantPath = path.join(targetDir, "openapi-tenant.json");
  fs.writeFileSync(tenantPath, JSON.stringify(tenantSpec, null, 2), "utf8");
  console.log(`✅ Generated Tenant OpenAPI specification: ${tenantPath}`);
}

if (require.main === module || process.argv[1]?.includes("generate-openapi")) {
  const projectRoot = path.resolve(__dirname, "../..");
  generateAllSpecs(projectRoot);
}
