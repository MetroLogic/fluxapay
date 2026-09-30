import { createController } from "../controller.helper";

describe("createController", () => {
  it("preserves body fields while exposing params and query without clobbering body collisions", async () => {
    const controller = createController(async (requestData: any) => requestData);

    const req: any = {
      body: {
        name: "example",
        params: "body-params-value",
        query: "body-query-value",
      },
      params: { id: "pay_123" },
      query: { status: "open" },
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    await controller(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "example",
        body: {
          name: "example",
          params: "body-params-value",
          query: "body-query-value",
        },
        params: { id: "pay_123" },
        query: { status: "open" },
      }),
    );
    const requestData = res.json.mock.calls[0][0];
    expect(requestData.body.params).toBe("body-params-value");
    expect(requestData.body.query).toBe("body-query-value");
    expect(requestData.params).toEqual({ id: "pay_123" });
    expect(requestData.query).toEqual({ status: "open" });
  });
});
